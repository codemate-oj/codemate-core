import $ from 'jquery';
import _ from 'lodash';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
 api, delay, gql, i18n, request, tpl,
} from 'vj/utils';

function update(name: string, uids: number[]) {
    return api(gql`
    domain { manage { group {
      update(name: ${name}, uids: ${uids})
    } } }
  `);
}
function del(name: string) {
    return api(gql`
    domain { manage { group {
      del(name: ${name})
    } } }
  `);
}

const page = new NamedPage('domain_group', () => {
    const createGroupDialogContent = $(tpl/* html */`
    <div>
      <div class="row"><div class="columns">
        <h1>${i18n('Create Group')}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Group Name')}
          <input name="create_group_name" type="text" class="textbox" data-autofocus>
        </label>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Users')}
          <input name="create_group_users" type="text" class="textbox" autocomplete="off">
        </label>
      </div></div>
    </div>
    `);
    const createGroupCodeDialogContent = $(tpl/* html */`
    <div>
        <div class="row">
            <div class="columns">
                <h1>添加激活码</h1>
            </div>
        </div>
        <div class="row">
            <div class="columns">
                <label>
                    过期时间
                    <input name="code_expire_at" type="date" class="textbox">
                </label>
            </div>
            <div class="columns">
                <label>
                    所属机构/人员
                    <input name="code_owner" type="text" class="textbox">
                </label>
            </div>
            <div class="columns">
                <label>
                    可激活次数
                    <input name="code_times" type="number" value="1" min="1" class="textbox">
                </label>
            </div>
            <div class="columns">
                <label>
                    生成个数
                    <input name="code_count" type="number" value="1" min="1" class="textbox">
                </label>
            </div>
        </div>
    </div>
    `);
    createGroupDialogContent.appendTo(document.body);
    createGroupCodeDialogContent.appendTo(document.body);
    const userSelect = UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>(createGroupDialogContent.find('[name="create_group_users"]'), {
        multi: true,
        height: 'auto',
    });
    const targets = {};
    $('input[data-gid]')
        .get()
        .forEach((ele) => {
            const input = UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>($(ele), { multi: true, height: 'auto' });
            const gid = ele.getAttribute('data-gid');
            targets[gid] = input;
            let loaded = false;
            input.onChange(() => {
                if (input.value().length && !loaded) {
                    loaded = true;
                    return;
                }
                if (!loaded) return;
                update(gid, input.value());
            });
        });

    const createGroupDialog = new ActionDialog({
        $body: createGroupDialogContent,
        onDispatch(action) {
            const $name = createGroupDialog.$dom.find('[name="create_group_name"]');
            if (action === 'ok' && ($name.val() === '' || !userSelect.value())) {
                $name.focus();
                return false;
            }
            return true;
        },
    });
    createGroupDialog.clear = function () {
        userSelect.clear();
        createGroupDialog.$dom.find('[name="create_group_name"]').val('');
        return this;
    };

    const createCodeDialog = new ActionDialog({
        $body: createGroupCodeDialogContent,
        onDispatch(action) {
            const $expireAt = createCodeDialog.$dom.find('[name="code_expire_at"]');
            if (action === 'ok' && $expireAt.val() === '') {
                $expireAt.trigger('focus').trigger('select');
                return false;
            }
            return true;
        },
    });

    function ensureAndGetSelectedGroups() {
        const groups = _.map($('.domain-group tbody [type="checkbox"]:checked'), (ch) => $(ch).closest('tr').attr('data-gid'));
        if (groups.length === 0) {
            Notification.error(i18n('Please select at least one group to perform this operation.'));
            return null;
        }
        return groups;
    }

    async function handleClickCreateGroup() {
        const action = await createGroupDialog.clear().open();
        if (action !== 'ok') return;
        const name = createGroupDialog.$dom.find('[name="create_group_name"]').val() as string;
        const uids = userSelect.value();
        try {
            await update(name, uids);
            window.location.reload();
        } catch (error) {
            Notification.error(error.message);
        }
    }

    async function handleClickDeleteSelected() {
        const selectedGroups = ensureAndGetSelectedGroups();
        if (selectedGroups === null) return;
        const action = await new ConfirmDialog({
            $body: tpl.typoMsg(i18n('Confirm deleting the selected groups?')),
        }).open();
        if (action !== 'yes') return;
        try {
            await Promise.all(selectedGroups.map((name) => del(name)));
            Notification.success(i18n('Selected groups have been deleted.'));
            await delay(2000);
            window.location.reload();
        } catch (error) {
            Notification.error(error.message);
        }
    }

    async function handleClickSaveAll() {
        for (const gid of Object.keys(targets)) {
            const uids = targets[gid].value();
            try {
                await update(gid, uids);
            } catch (error) {
                Notification.error(error.message);
            }
        }
        Notification.success(i18n('Saved.'));
    }

    async function handleClickAddCode(gid: string) {
        const action = await createCodeDialog.open();
        if (action !== 'ok') return;
        const expireAt = new Date(createCodeDialog.$dom.find('[name="code_expire_at"]').val() as string);
        const codeTimes = createCodeDialog.$dom.find('[name="code_times"]').val() as string;
        const codeCount = createCodeDialog.$dom.find('[name="code_count"]').val() as string;
        const owner = createCodeDialog.$dom.find('[name="code_owner"]').val() as string;
        try {
            const { success, url } = await request.post(`/domain/group/${gid}/code`, {
                operation: 'add',
                expireAt,
                owner,
                times: codeTimes,
                genNum: codeCount,
            });
            if (success) {
                window.location.href = url ?? window.location.href;
            }
        } catch (error) {
            Notification.error(error.message);
        }
    }

    async function getGroupCode(group) {
        const { tokens, error } = await request.get(`/domain/group/${group._id}/code`);
        if (error) Promise.reject(error);
        if (!Array.isArray(tokens)) return;
        const $tr = $(`tr[data-gid="${group.name}"]`);
        $tr.after(
            $(/* html */ `
                    <tr data-gid="${group.name}" class="activation-row">
                        <td></td>
                        <td colspan="2" class="activation-codes">
                            <div class="activation-codes__header">
                                <h4>所有激活码</h4>
                                <button name="add_code" data-real-gid="${group._id}">添加</button>
                            </div>
                            <table>
                                <colgroup>
                                    <col style="width: 100px">
                                    <col style="width: 150px">
                                    <col style="width: 200px">
                                    <col style="width: 100px">
                                </colgroup>
                                <tr>
                                    <th>激活码</th>
                                    <th>所属机构</th>
                                    <th>过期时间</th>
                                    <th>剩余次数</th>
                                </tr>
                                ${
                                    tokens
                                        .map(
                                            (token) => /* html */ `
                                    <tr>
                                        <td>${token._id}</td>
                                        <td>${token.owner}</td>
                                        <td>${token.expireAt}</td>
                                        <td>${token.remaining}</td>
                                    </tr>
                                `,
                                        )
                                        .join('')
                                    /* html */ || `
                                        <tr>
                                            <td colspan="4">
                                                暂无数据，请点击上方按钮添加
                                            </td>
                                        </tr>
                                    `
                                }
                            </table>
                        </td>
                `),
        );
    }
    $(document).on('click', (ev) => {
        if ($(ev.target).is('[name="add_code"]')) {
            const gid = $(ev.target).attr('data-real-gid');
            handleClickAddCode(gid);
        }
    });

    const _showMap = {};
    $('[name="show_code"]').on('click', async (ev) => {
        const $btn = $(ev.currentTarget);
        const $tr = $btn.closest('tr');
        const gname = $tr.attr('data-gid');

        if (_showMap[gname]) {
            $btn.text('显示激活码');
            $tr.siblings(`tr.activation-row[data-gid="${gname}"]`).remove();
            _showMap[gname] = false;
            return;
        }

        // 首次加载，获取数据并加载dom
        if (!UiContext.gdocs?.length || !gname) {
            Notification.error('获取激活码信息失败，请刷新后重试');
            return;
        }
        const group = UiContext.gdocs.find((doc) => doc.name === gname);
        if (!group) {
            Notification.error('获取激活码信息失败，请刷新后重试');
            return;
        }
        await getGroupCode(group);
        $btn.text('隐藏激活码');
        _showMap[gname] = true;
    });
    $('[name="create_group"]').click(() => handleClickCreateGroup());
    $('[name="remove_selected"]').click(() => handleClickDeleteSelected());
    $('[name="save_all"]').on('click', () => handleClickSaveAll());
});

export default page;
