import 'jquery.easing';

import $ from 'jquery';
import { groupBy } from 'lodash';
import { ConfirmDialog } from 'vj/components/dialog';
import CommentBox from 'vj/components/discussion/CommentBox';
import { AutoloadPage } from 'vj/misc/Page';
import { delay, i18n, request, slideDown, slideUp, tpl } from 'vj/utils';

const $replyTemplate = $('.commentbox-container').eq(0).clone();
let priceGroup = {};

function setForLabel($obj) {
  $obj.find('[for-next-label]').each((i, v) => {
    const time = new Date().getTime();
    const $input = $(v);
    const $label = $input.next();
    const id = $input.attr('id') || `forlabel-${time}-${i}`;
    $input.attr('id', id);
    $label.attr('for', id);
  });
}

function getPriceForm($obj) {
  return {
    price: $obj.find('[name="price"]').eq(-1).val(),
    isPaid: !!$obj.find('[name="isPaid"]:checked').eq(-1).length,
    hasVideo: +$obj.find('[name="hasVideo"]:checked').eq(-1).val(),
  };
}

function setPrice($obj) {
  const form = getPriceForm($obj);
  const priceTags = $('#raw-price-tags')[0].innerText.split(',');
  let price = 0;
  if (form.isPaid) {
    if (form.hasVideo) {
      priceTags.push(form.hasVideo ? '名师视频题解' : '名师文字题解');
    }
    price = Object.keys(priceGroup).reduce((total, cur) => total * (priceGroup[cur].find((v) => priceTags.includes(v.value))?.ratio || 1), 1);
  }
  price /= 10;
  $obj
    .find('[name="price"]')
    .eq(-1)
    .val(`${price || ''}`);
}

function onPaidOp($obj) {
  $obj.on('change', '[name="isPaid"]', () => setPrice($obj));
  $obj.on('change', '[name="hasVideo"]', () => setPrice($obj));
}

function createReplyContainer($parent) {
  const $container = $replyTemplate.clone().hide().prependTo($parent.find('.commentbox-reply-target').eq(0)).trigger('vjContentNew');
  return $container.find('.commentbox-placeholder');
}

async function showReplyContainer($parent) {
  const $container = $parent.find('.commentbox-container');
  // TODO: fix ugly hack. cannot get $container rect because it is invisible
  const rect = $container.parent()[0].getBoundingClientRect();
  const rectBody = document.body.getBoundingClientRect();
  if (rect.top < 100 || rect.top + 100 > window.innerHeight) {
    const targetScrollTop = rect.top - rectBody.top - window.innerHeight * 0.382;
    $('html, body').stop().animate({ scrollTop: targetScrollTop }, 400, 'easeOutCubic');
    await delay(300);
    // delay duration is set smaller than animation duration intentionally
  }
  $container.css('opacity', 0);
  await slideDown($container, 300);
  await $container.transition({ opacity: 1 }, { duration: 200 }).promise();
  $container.removeAttr('style');
}

async function destroyReplyContainer($parent) {
  const $container = $parent.find('.commentbox-container');
  $container.css('opacity', 1);
  await $container.transition({ opacity: 0 }, { duration: 200 }).promise();
  await slideUp($container, 300);
  $container.remove();
}

function onClickDummyBox(ev) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    CommentBox.get($evTarget).focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const opt = {
    form: JSON.parse($evTarget.attr('data-form')),
    mode: 'comment',
    onGet: () => getPriceForm($mediaBody),
    onCancel: () => {
      $mediaBody.removeClass('is-editing');
    },
  };

  $mediaBody.addClass('is-editing');

  CommentBox.getOrConstruct($evTarget, opt).appendTo($mediaBody.find('.commentbox-placeholder').eq(0)).focus();
  setForLabel($mediaBody);
  onPaidOp($mediaBody);
}

async function onCommentClickReplyComment(ev, options: any = {}) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    // If comment box is already expanded,
    // we should insert "initialText"
    CommentBox.get($evTarget)
      .insertText(options.initialText || '')
      .focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const opt = {
    initialText: '',
    mode: 'reply',
    ...options,
    onCancel: async () => {
      await destroyReplyContainer($mediaBody);
    },
  };

  const cbox = CommentBox.getOrConstruct($evTarget, {
    form: JSON.parse($evTarget.attr('data-form')),
    ...opt,
  }).appendTo(createReplyContainer($mediaBody));
  await showReplyContainer($mediaBody);
  cbox.focus();
}

async function onCommentClickReplyReply(ev) {
  const $evTarget = $(ev.currentTarget);
  const $mediaBody = $evTarget.closest('.media__body');
  const uid = $mediaBody.find('.user-profile-name').attr('href').split('/user/')[1];

  $evTarget
    .closest('.dczcomments__item')
    .find('[data-op="reply"][data-type="comment"]')
    .eq(0)
    .trigger('click', { initialText: `@[](/user/${uid.trim()}) ` });
}

async function onCommentClickEdit(mode, ev) {
  const $evTarget = $(ev.currentTarget);

  if (CommentBox.get($evTarget)) {
    CommentBox.get($evTarget).focus();
    return;
  }

  const $mediaBody = $evTarget.closest('.media__body');

  const raw = await request.get($mediaBody.find('.typo').eq(0).attr('data-raw-url'), {}, { dataType: 'text' });

  const opt = {
    initialText: raw,
    form: JSON.parse($evTarget.attr('data-form')),
    mode,
    onGet: () => getPriceForm($mediaBody),
    onCancel: () => {
      $mediaBody.removeClass('is-editing');
    },
  };

  $mediaBody.addClass('is-editing');

  CommentBox.getOrConstruct($evTarget, opt).appendTo($mediaBody.find('.commentbox-edit-target').eq(0)).focus();
  const price = `${$mediaBody.find('[data-price]').data('price') || ''}`;
  const hasVideo = `${$mediaBody.find('[data-has-video]').data('has-video') || ''}`;
  $mediaBody.find('[name="price"]').val(price);
  $mediaBody.find('[name="isPaid"]').prop('checked', !!price);
  $mediaBody.find(`[name="hasVideo"][value="${hasVideo}"]`).prop('checked', true);
  setForLabel($mediaBody);
  onPaidOp($mediaBody);
}

function onCommentClickEditComment(ev) {
  return onCommentClickEdit('comment-update', ev);
}

function onCommentClickEditReply(ev) {
  return onCommentClickEdit('reply-update', ev);
}

async function onCommentClickDelete(type, ev) {
  const message = type === 'comment' ? 'Confirm deleting this comment? Its replies will be deleted as well.' : 'Confirm deleting this reply?';
  const action = await new ConfirmDialog({
    $body: tpl.typoMsg(i18n(message)),
  }).open();
  if (action !== 'yes') return;

  const $evTarget = $(ev.currentTarget);
  const form = JSON.parse($evTarget.attr('data-form'));

  await request.post('', form);
  window.location.reload();
}

function onCommentClickDeleteComment(ev) {
  onCommentClickDelete('comment', ev);
}

function onCommentClickDeleteReply(ev) {
  onCommentClickDelete('reply', ev);
}

async function initPricingRules() {
  if ($('#raw-price-tags').length) {
    await request.get('/problem-tags/pricing').then((res) => {
      priceGroup = groupBy(res.data.data, 'category');
    });
  }
}

const commentsPage = new AutoloadPage('commentsPage', () => {
  initPricingRules();

  $(document).on('click', '[name="dczcomments__dummy-box"]', onClickDummyBox);
  $(document).on('click', '[data-op="reply"][data-type="comment"]', onCommentClickReplyComment);
  $(document).on('click', '[data-op="reply"][data-type="reply"]', onCommentClickReplyReply);
  $(document).on('click', '[data-op="edit"][data-type="comment"]', onCommentClickEditComment);
  $(document).on('click', '[data-op="edit"][data-type="reply"]', onCommentClickEditReply);
  $(document).on('click', '[data-op="delete"][data-type="comment"]', onCommentClickDeleteComment);
  $(document).on('click', '[data-op="delete"][data-type="reply"]', onCommentClickDeleteReply);
});

export default commentsPage;
