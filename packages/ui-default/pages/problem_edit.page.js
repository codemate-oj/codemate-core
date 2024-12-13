import $ from 'jquery';
import _ from 'lodash';
import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { ConfirmDialog } from 'vj/components/dialog';
import Dropdown from 'vj/components/dropdown/Dropdown';
import Editor from 'vj/components/editor/index';
import Notification from 'vj/components/notification';
import uploadFiles from 'vj/components/upload';
import download from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import { i18n, pjax, request, slideDown, slideUp, tpl } from 'vj/utils';

const originOptions = [
  // '无',
  '原创',
  '拓展',
  '官方真题',
  '官方样题',
  'GESP考级官方',
  '电子学会考级官方',
  '蓝桥杯官方',
  'CSP-J官方',
  'CSP-S官方',
  '大赛官方',
  '外部题库',
  '一本通',
  '其他',
];

const chapterOptions = [];

const categories = {};
const dirtyCategories = [];
const selections = [];
const tags = [];
const splitReg = /\s*[,，]+\s*/;

function setReactState(dom, value) {
  const reactContainerKey = Object.keys(dom.nextSibling).find((v) => v.startsWith('__reactContainer'));
  dom.nextSibling[reactContainerKey]?.child?.child?.child?.memoizedState?.next?.next?.queue?.dispatch(value);
}

function getFormTags() {
  const $allInputTags = $('[name="tag"]');
  const $selectChapterTags = $('[name="chapter"]');
  const allInputTags = $allInputTags.val().split(splitReg);
  const selectChapterTags = $selectChapterTags.val().split(splitReg);
  // const inputChapterTags = allInputTags.filter((v) => chapterOptions.includes(v));
  const othersTags = _.difference(allInputTags, chapterOptions);
  const orderTags = [...selectChapterTags];

  [...$('div[id^="defined-tag-category-"] select')].forEach((select) => {
    orderTags.push(select.value);
    _.pullAll(
      othersTags,
      [...select.options].map((v) => v.value),
    );
  });

  _.pullAll(othersTags, originOptions);
  orderTags.push(...$('[name=origin]').val().split(splitReg));

  orderTags.push(..._.difference(othersTags, orderTags));
  return orderTags.filter((v) => v && v !== '无');
}

function setDomSelected($dom, selected) {
  if (selected) $dom.addClass('selected');
  else $dom.removeClass('selected');
}

async function updateSelection() {
  for (const { type, category, subcategory } of dirtyCategories) {
    let item = categories[category];
    const isSelected = item.select || _.some(item.children, (c) => c.select);
    setDomSelected(item.$tag, isSelected);
    if (isSelected) selections.push(category);
    else _.pull(selections, category);
    if (type === 'subcategory') {
      item = categories[category].children[subcategory];
      setDomSelected(item.$tag, item.select);
      const selectionName = subcategory;
      if (item.select) selections.push(selectionName);
      else _.pull(selections, selectionName);
    }
  }
  const requestCategoryTags = _.uniq(selections.filter((s) => s.indexOf(',') !== -1).map((s) => s.split(',')[0]));
  // drop the category if its subcategory is selected
  const requestTags = _.uniq(_.pullAll(selections, requestCategoryTags));
  dirtyCategories.length = 0;
  const $txt = $('[name="tag"]');
  const newValues = [...requestTags, ...tags];
  const oldValues = $txt.val().split(splitReg);
  if (!(newValues.length === oldValues.length && newValues.every((v) => oldValues.includes(v)))) {
    $txt.val(newValues.join(', ')).trigger('change');
  }
}

function findCategory(name) {
  const keys = Object.keys(categories);
  if (keys.includes(name)) return [name, null];
  for (const category of keys) {
    const subkeys = Object.keys(categories[category].children);
    if (subkeys.includes(name)) return [category, name];
  }
  return [null, null];
}

function parseCategorySelection() {
  const $txt = $('[name="tag"]');
  tags.length = 0;
  for (const name of $txt
    .val()
    .split(',')
    .map((i) => i.trim())) {
    if (!name) return;
    const [category, subcategory] = findCategory(name);
    if (!category) tags.push(name);
    else if (!subcategory) {
      categories[category].select = true;
      dirtyCategories.push({ type: 'category', category });
    } else {
      categories[category].children[subcategory].select = true;
      dirtyCategories.push({ type: 'subcategory', subcategory, category });
    }
  }
  updateSelection();
}

function addOrderTags() {
  const $allInputTags = $('[name="tag"]');
  const allInputTags = $allInputTags.val().split(splitReg);
  const newValues = getFormTags();
  if (!_.isEqual(allInputTags, newValues)) {
    $allInputTags.val(newValues.join(', '));
  }
}

function buildCategoryFilter() {
  const $container = $('[data-widget-cf-container]');
  if (!$container) return;
  $container.attr('class', 'widget--category-filter row small-up-3 medium-up-2');
  for (const category of $container.children('li').get()) {
    const $category = $(category).attr('class', 'widget--category-filter__category column');
    const $categoryTag = $category.find('.section__title a').remove().attr('class', 'widget--category-filter__tag');
    const categoryText = $categoryTag.text();
    const $drop = $category.children('.chip-list').remove().attr('class', 'widget--category-filter__drop');
    const treeItem = {
      select: false,
      $tag: $categoryTag,
      children: {},
    };
    categories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      const $subCategoryTags = $drop
        .children('li')
        .attr('class', 'widget--category-filter__subcategory')
        .find('a')
        .attr('class', 'widget--category-filter__tag')
        .attr('data-category', categoryText);
      for (const subCategoryTag of $subCategoryTags.get()) {
        const $tag = $(subCategoryTag);
        treeItem.children[$tag.text()] = { select: false, $tag };
      }
      Dropdown.getOrConstruct($categoryTag, {
        target: $drop[0],
        position: 'left center',
      });
    }
  }
  $(document).on('click', '.widget--category-filter__tag', (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const tag = $(ev.currentTarget).text();
    const category = $(ev.currentTarget).attr('data-category');
    const treeItem = category ? categories[category].children[tag] : categories[tag];
    // the effect should be cancelSelect if it is shown as selected when clicking
    const shouldSelect = treeItem.$tag.hasClass('selected') ? false : !treeItem.select;
    treeItem.select = shouldSelect;
    dirtyCategories.push(category ? { type: 'subcategory', subcategory: tag, category } : { type: 'category', category: tag });
    if (!category && !shouldSelect) {
      // de-select children
      _.forEach(treeItem.children, (treeSubItem, subcategory) => {
        if (treeSubItem.select) {
          treeSubItem.select = false;
          dirtyCategories.push({ type: 'subcategory', subcategory, category: tag });
        }
      });
    }
    updateSelection();
    ev.preventDefault();
  });
}

async function handleSection(ev, sidebar, type) {
  const $section = $(ev.currentTarget).closest(`.section--problem-sidebar-${sidebar}`);
  if ($section.is(`.${type}d, .animating`)) return;
  $section.addClass('animating');
  const $detail = $section.find(`.section--problem-sidebar-${sidebar}__detail`);
  if (type === 'expand') {
    await slideDown($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await slideUp($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(type === 'expand' ? 'expanded' : 'collapsed');
  $section.removeClass(type === 'expand' ? 'collapsed' : 'expanded');
  $section.removeClass('animating');
}

function fillFormTags() {
  const $allInputTags = $('[name="tag"]');
  const $selectChapterTags = $('[name="chapter"]');
  const allInputTags = $allInputTags.val().split(splitReg);
  const inputChapterTags = allInputTags.filter((v) => chapterOptions.includes(v));
  $selectChapterTags.val(inputChapterTags.join(','));

  [...$('div[id^="defined-tag-category-"] select')].forEach((select) => {
    const options = [...select.options].map((v) => v.value).filter((v) => allInputTags.includes(v));
    select.value = options.join(',') || '无';
  });

  const $selectOriginTags = $('[name="origin"]');
  const inputOriginTags = allInputTags.filter((v) => originOptions.includes(v));
  $selectOriginTags.val(inputOriginTags.join(','));

  setReactState($selectChapterTags[0], inputChapterTags);
  setReactState($selectOriginTags[0], inputOriginTags);
  parseCategorySelection();
}

export default new NamedPage(['problem_create', 'problem_edit'], (pagename) => {
  let confirmed = false;
  $(document).on('click', '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return request
        .post('.', { operation: 'delete' })
        .then((res) => {
          window.location.href = res.url;
        })
        .catch((e) => {
          Notification.error(e.message);
        });
    }
    const message = 'Confirm deleting this problem? Its files, submissions, discussions and solutions will be deleted as well.';
    return new ConfirmDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n(message)}</p>
        </div>`,
    })
      .open()
      .then((action) => {
        if (action !== 'yes') return;
        confirmed = true;
        ev.target.click();
      });
  });
  $(document).on('change', '[name="tag"]', fillFormTags);
  buildCategoryFilter();
  parseCategorySelection();

  async function handleClickUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.click();
    await new Promise((resolve) => {
      input.onchange = resolve;
    });
    await uploadFiles('./files', input.files, {
      type: 'additional_file',
      sidebar: true,
      pjax: true,
    });
  }

  async function handleClickRename(ev) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    // eslint-disable-next-line no-alert
    const newName = prompt(i18n('Enter a new name for the file: '));
    if (!newName) return;
    try {
      await request.post('./files', {
        operation: 'rename_files',
        files: file,
        newNames: [newName],
        type: 'additional_file',
      });
      Notification.success(i18n('File have been renamed.'));
      await pjax.request({ url: './files?d=additional_file&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickRemove(ev) {
    const file = [$(ev.currentTarget).parent().parent().attr('data-filename')];
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm to delete the file?')),
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('./files', {
        operation: 'delete_files',
        files: file,
        type: 'additional_file',
      });
      Notification.success(i18n('File have been deleted.'));
      await pjax.request({ url: './files?d=additional_file&sidebar=true', push: false });
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickDownloadAll() {
    const files = $('.additional_file-table tr')
      .map(function () {
        return $(this).attr('data-filename');
      })
      .get();
    const { links, pdoc } = await request.post('./files', { operation: 'get_links', files, type: 'additional_file' });
    const targets = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await download(`${pdoc.docId} ${pdoc.title}.zip`, targets);
  }

  function initSelectOptions() {
    request.get('/problem-tags').then((res) => {
      const chapterTagsSet = new Set(res.data.data.map((v) => v.chapter));
      chapterOptions.push(...chapterTagsSet);
      const select = CustomSelectAutoComplete.getOrConstruct($('[name=chapter]'), {
        multi: true,
        data: chapterOptions,
      });

      const originSelect = CustomSelectAutoComplete.getOrConstruct($('[name=origin]'), {
        multi: true,
        data: originOptions,
      });

      const $allTags = $('[name="tag"]');
      const allTags = $allTags.val().split(splitReg);

      $('[name=chapter]').val(allTags.filter((v) => v && chapterTagsSet.has(v)).join(','));

      $('[name=origin]').val(allTags.filter((v) => v && originOptions.includes(v)).join(','));

      originSelect.onChange(() => {
        addOrderTags();
      });

      select.onChange(() => {
        selections.length = 0;
        dirtyCategories.length = 0;
        $('.widget--category-filter__tag').removeClass('selected');
        parseCategorySelection();
        addOrderTags();
      });
    });
  }

  setInterval(() => {
    $('img').each(function () {
      if (this.src.startsWith('file://')) {
        $(this).attr(
          'src',
          $(this)
            .attr('src')
            .replace('file://', pagename === 'problem_create' ? `/file/${UserContext._id}/` : './file/'),
        );
      }
    });
  }, 500);

  const $main = $('textarea[data-editor]');
  const $field = $('textarea[data-markdown-upload]');
  let content = $field.val();
  let isObject = false;
  let activeTab = $('[data-lang]').first().attr('data-lang');
  try {
    content = JSON.parse(content);
    isObject = !(content instanceof Array);
    if (!isObject) content = JSON.stringify(content);
  } catch (e) {}
  if (!isObject) content = { [activeTab]: content };
  function getContent(lang) {
    let c = '';
    if (content[lang]) c = content[lang];
    else {
      const list = Object.keys(content).filter((l) => l.startsWith(lang));
      if (list.length) c = content[list[0]];
    }
    if (typeof c !== 'string') c = JSON.stringify(c);
    return c;
  }
  $main.val(getContent(activeTab));
  function onChange(val) {
    try {
      val = JSON.parse(val);
      if (!(val instanceof Array)) val = JSON.stringify(val);
    } catch {}
    const empty = /^\s*$/g.test(val);
    if (empty) delete content[activeTab];
    else content[activeTab] = val;
    if (!Object.keys(content).length) $field.text('');
    else $field.text(JSON.stringify(content));
  }
  const editor = Editor.getOrConstruct($main, { onChange });
  $('[data-lang]').on('click', (ev) => {
    $('[data-lang]').removeClass('tab--active');
    $(ev.currentTarget).addClass('tab--active');
    const lang = $(ev.currentTarget).attr('data-lang');
    activeTab = lang;
    const val = getContent(lang);
    editor.value(val);
  });
  $('[type="submit"]').on('click', (ev) => {
    if (!$('[name="title"]').val().toString().length) {
      Notification.error(i18n('Title is required.'));
      $('body').scrollTop();
      $('html, body').animate({ scrollTop: 0 }, 300, () => $('[name="title"]').focus());
      ev.preventDefault();
    }
  });
  $(document).on('click', '[name="additional_file__upload"]', () => handleClickUpload());
  $(document).on('click', '[name="additional_file__rename"]', (ev) => handleClickRename(ev));
  $(document).on('click', '[name="additional_file__delete"]', (ev) => handleClickRemove(ev));
  $(document).on('click', '[name="additional_file__download"]', () => handleClickDownloadAll());
  $(document).on('click', '[name="additional_file__section__expand"]', (ev) => handleSection(ev, 'additional_file', 'expand'));
  $(document).on('click', '[name="additional_file__section__collapse"]', (ev) => handleSection(ev, 'additional_file', 'collapse'));
  $(document).on('click', '[name="tags__section__expand"]', (ev) => handleSection(ev, 'tags', 'expand'));
  $(document).on('click', '[name="tags__section__collapse"]', (ev) => handleSection(ev, 'tags', 'collapse'));

  $(document).on('change', 'div[id^="defined-tag-category-"] select', () => addOrderTags());
  initSelectOptions();
});
