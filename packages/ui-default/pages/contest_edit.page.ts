import $ from 'jquery';
import moment from 'moment';
import React from 'react';
import ReactDOM from 'react-dom/client';
// import ProblemSelectAutoComplete from 'vj/components/autocomplete/ProblemSelectAutoComplete';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ConfirmDialog } from 'vj/components/dialog';
import ConfigProblems from 'vj/components/organizedProblems';
import { NamedPage } from 'vj/misc/Page';
import { api, gql, i18n, request, tpl } from 'vj/utils';

const renderProblemsConfig = () => {
  const container = document.getElementById('problems-config-container');
  ReactDOM.createRoot(container).render(
    React.createElement(ConfigProblems, {
      fetchProblem: (pid: string) =>
        api(
          gql`
      problem(pid: ${pid}) {
        docId
        pid
        title
      }
    `,
          ['data', 'problem'],
        ),
      fetchAll: (ids: number[]) =>
        api(
          gql`
        problems(ids: ${ids}) {
          docId
          pid
          title
        }
      `,
          ['data', 'problems'],
        ),
      onProblemChange: (pids: string) => {
        $('[name="pids"]').val(pids);
      },
      defaultValue:
        container.dataset.init ||
        JSON.stringify([
          {
            name: '未分类',
            problems: `${$('[name="pids"]').val()}`.split(',').map((docId) => ({
              docId: +docId,
            })),
          },
        ]),
    }),
  );
};

const page = new NamedPage(['contest_edit', 'contest_create', 'homework_create', 'homework_edit', 'plist_edit'], (pagename) => {
  renderProblemsConfig();
  $(document).on('change', '[name="paidJudgement"], [name="paidAttend"], [name="paidEvalution"]', function () {
    const target = $(this)[0];
    $(`[name=${target.name.replace('paid', '').toLowerCase()}Price]`).val(target.checked ? '1' : '');
  });
  $(document).on('change', '[name="judgementPrice"], [name="attendPrice"], [name="evalutionPrice"]', function () {
    const target = $(this)[0];
    target.value = `${+target.value || ''}`;
    const name = target.name.replace('Price', '');
    $(`[name=paid${name.charAt(0).toUpperCase()}${name.slice(1)}]`).prop('checked', !!target.value);
  });
  $(document).on('change', '[name=contestMode]', function () {
    const target = $(this)[0];
    const monitor = $('[name=hasMonitor]')[0] as HTMLInputElement;
    if (target.value === 'regular' && target.checked && monitor.checked) {
      monitor.checked = false;
    }
  });
  $(document).on('change', '[name=hasMonitor]', function () {
    const target = $(this)[0];
    if (target.checked) {
      ($('[name=contestMode][value=defined]')[0] as HTMLInputElement).checked = true;
    }
  });
  // ProblemSelectAutoComplete.getOrConstruct($('[name="pids"]'), { multi: true, clearDefaultValue: false });
  UserSelectAutoComplete.getOrConstruct<true>($('[name="maintainer"]'), { multi: true, clearDefaultValue: false });
  $('[name="rule"]')
    .on('change', () => {
      const rule = $('[name="rule"]').val();
      $('.contest-rule-settings input').attr('disabled', 'disabled');
      $('.contest-rule-settings').hide();
      $(`.contest-rule--${rule} input`).removeAttr('disabled');
      $(`.contest-rule--${rule}`).show();
    })
    .trigger('change');
  $('[name="beginAtDate"], [name="beginAtTime"], [name="duration"]').on('change', () => {
    const beginAtDate = $('[name="beginAtDate"]').val();
    const beginAtTime = $('[name="beginAtTime"]').val();
    const duration = $('[name="duration"]').val();
    const endAt = moment(`${beginAtDate} ${beginAtTime}`).add(+duration, 'hours').toDate();
    if (endAt) $('[name="endAt"]').val(moment(endAt).format('YYYY-MM-DD HH:mm'));
  });
  $('[name="permission"]')
    .removeAttr('disabled')
    .on('change', () => {
      const type = $('[name="permission"]').val();
      $('[data-perm] input').attr('disabled', 'disabled');
      $('[data-perm]').hide();
      $(`[data-perm="${type}"] input`).removeAttr('disabled');
      $(`[data-perm="${type}"]`).show();
    })
    .trigger('change');
  if (pagename.endsWith('edit')) {
    let confirmed = false;
    $(document).on('click', '[value="delete"]', (ev) => {
      ev.preventDefault();
      if (confirmed) {
        return request.post('', { operation: 'delete' }).then((res) => {
          window.location.href = res.url;
        });
      }
      const message = `Confirm deleting this ${pagename.split('_')[0]}? Its files and status will be deleted as well.`;
      return new ConfirmDialog({
        $body: tpl.typoMsg(i18n(message)),
      })
        .open()
        .then((action) => {
          if (action !== 'yes') return;
          confirmed = true;
          ev.target.click();
        });
    });
    setInterval(() => {
      $('img').each(function () {
        if ($(this).attr('src').startsWith('file://')) {
          $(this).attr('src', $(this).attr('src').replace('file://', './file/'));
        }
      });
    }, 500);
  }
});

export default page;
