import * as TencentCloudSDK from 'tencentcloud-sdk-nodejs-tts';
import type { Client as TtsClientType } from 'tencentcloud-sdk-nodejs-tts/tencentcloud/services/tts/v20190823/tts_client';
import { Context, Handler, nanoid, param, SettingModel, SystemModel, Types } from 'hydrooj';

declare module 'hydrooj' {
    interface Lib {
        tts: TtsClientType;
    }
}

class TtsHandler extends Handler {
    @param('text', Types.String)
    async get(domainId: string, text: string) {
        const sessionId = nanoid();

        const res = await global.Hydro.lib.tts.TextToVoice({
            Text: text,
            SessionId: sessionId,
            Codec: 'mp3',
            VoiceType: 601009,
        });

        this.response.body = {
            b64AudioMp3File: res.Audio,
            qCloudSessionId: sessionId,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('tts', '/tts', TtsHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.secretId', '', 'text', 'TTS SecretId'));
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.secretKey', '', 'text', 'TTS SecretKey'));
    });

    global.Hydro.lib.tts = new TencentCloudSDK.tts.v20190823.Client({
        credential: {
            secretId: await SystemModel.get('tts.secretId'),
            secretKey: await SystemModel.get('tts.secretKey'),
        },
        region: '',
        profile: {
            httpProfile: {
                endpoint: 'tts.tencentcloudapi.com',
            },
        },
    });
}
