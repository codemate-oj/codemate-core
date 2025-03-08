import COS from 'cos-nodejs-sdk-v5';
import * as TencentCloudSDK from 'tencentcloud-sdk-nodejs-tts';
import type { Client as TtsClientType } from 'tencentcloud-sdk-nodejs-tts/tencentcloud/services/tts/v20190823/tts_client';
import { Context, db, Handler, md5, nanoid, ObjectId, param, SettingModel, SystemModel, Types } from 'hydrooj';

const TYPE_TTS_DATA = 110;

export interface TtsDataDoc {
    docType: 110;
    docId: ObjectId;
    domainId: string;
    fileId: string;
    text: string;
    textHash: string;
}

declare module 'hydrooj' {
    interface DocType {
        [TYPE_TTS_DATA]: TtsDataDoc;
    }

    interface Lib {
        tts: TtsClientType;
        tts_cos: COS;
    }
}

const coll = db.collection('document');

const getFileKey = (fileId: string) => `${fileId}.mp3`;

class TtsHandler extends Handler {
    @param('text', Types.String)
    async get(domainId: string, text: string) {
        const textMd5 = md5(text);
        const doc = await coll.findOne<TtsDataDoc>({ docType: TYPE_TTS_DATA, domainId, textHash: textMd5 });
        const bucket = await SystemModel.get('tts.bucket');
        const region = await SystemModel.get('tts.region');

        if (doc) {
            const url = await new Promise((resolve, reject) => {
                global.Hydro.lib.tts_cos.getObjectUrl(
                    {
                        Bucket: bucket,
                        Region: region,
                        Key: getFileKey(doc.fileId),
                        Sign: true,
                    },
                    (err, data) => (err ? reject(err) : resolve(data.Url)),
                );
            });

            this.response.body = {
                audioUrl: url,
            };

            return;
        }

        const fileId = nanoid();

        const res = await global.Hydro.lib.tts.TextToVoice({
            Text: text,
            SessionId: fileId,
            Codec: 'mp3',
            VoiceType: 601009,
        });

        const buffer = Buffer.from(res.Audio, 'base64');
        await new Promise((resolve, reject) => {
            global.Hydro.lib.tts_cos.putObject(
                {
                    Bucket: bucket,
                    Region: region,
                    Key: getFileKey(fileId),
                    Body: buffer,
                },
                (err) => (err ? reject(err) : resolve(1)),
            );
        });

        await coll.insertOne({
            docType: TYPE_TTS_DATA,
            docId: new ObjectId(),
            domainId,
            fileId,
            text,
            textHash: textMd5,
        });

        const url = await new Promise((resolve, reject) => {
            global.Hydro.lib.tts_cos.getObjectUrl(
                {
                    Bucket: bucket,
                    Region: region,
                    Key: getFileKey(fileId),
                    Sign: true,
                },
                (err, data) => (err ? reject(err) : resolve(data.Url)),
            );
        });

        this.response.body = {
            audioUrl: url,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('tts', '/tts', TtsHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.secretId', '', 'text', 'TTS SecretId'));
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.secretKey', '', 'text', 'TTS SecretKey'));
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.bucket', '', 'text', 'TTS COS bucket'));
        c.setting.SystemSetting(SettingModel.Setting('setting_secrets', 'tts.region', '', 'text', 'TTS COS region'));
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

    global.Hydro.lib.tts_cos = new COS({
        SecretId: await SystemModel.get('tts.secretId'),
        SecretKey: await SystemModel.get('tts.secretKey'),
    });
}
