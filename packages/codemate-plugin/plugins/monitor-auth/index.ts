import STS from 'qcloud-cos-sts';
import { iai } from 'tencentcloud-sdk-nodejs-iai';
import { ContestModel, ContestNotFoundError, Context, Handler, ObjectId, param, PERM, PRIV, route, SystemModel, Types } from 'hydrooj';

const IaiClient = iai.v20200303.Client;
// 定义配置接口
interface COSConfig {
    secretId: string;
    secretKey: string;
    proxy: string;
    durationSeconds: number;
    bucket: string;
    region: string;
    allowPrefix: string;
    allowActions: string[];
}
// 定义临时密钥响应接口
interface STSCredentials {
    credentials: {
        tmpSecretId: string;
        tmpSecretKey: string;
        sessionToken: string;
    };
    startTime: number;
    expiredTime: number;
}

const getAuthCredential = async (config: COSConfig) => {
    const { allowPrefix, bucket, region, secretId, secretKey, durationSeconds, allowActions } = config;

    const AppId = config.bucket.substr(bucket.lastIndexOf('-') + 1);

    const { credentials, startTime, expiredTime }: STSCredentials = await STS.getCredential({
        secretId,
        secretKey,
        durationSeconds,
        policy: {
            version: '2.0',
            statement: [
                {
                    action: allowActions,
                    effect: 'allow',
                    resource: [`qcs::cos:${region}:uid/${AppId}:${bucket}/${allowPrefix}`],
                },
            ],
        },
    });

    return {
        credentials,
        startTime,
        expiredTime,
        bucket,
        region,
        allowPrefix: allowPrefix.slice(0, -2),
    };
};

class CosAuthHandler extends Handler {
    @route('contestId', Types.ObjectId)
    async get(domainId: string, contestId: ObjectId) {
        const config: COSConfig = global.Hydro.lib.cosStsAuthConfig;
        const allowPrefix = config.allowPrefix.replace('contestId', contestId.toString()).replace('userId', `${this.user._id}`);

        this.response.body = {
            data: await getAuthCredential({
                ...config,
                allowPrefix,
            }),
        };
    }

    @route('contestId', Types.ObjectId)
    @param('urlB', Types.String)
    async post(domainId: string, contestId: ObjectId, UrlB: string) {
        const client = new IaiClient(global.Hydro.lib.cosContestCheckConfig);
        const params = {
            FaceModelVersion: '3.0',
            UrlA: 'https://tts-1325135518.cos.ap-guangzhou.myqcloud.com/contest/contestId/user/userId/face.png'
                .replace('contestId', contestId.toString())
                .replace('userId', `${this.user._id}`),
            UrlB,
        };

        this.response.body = {
            data: await client.CompareFace(params),
        };
    }
}

class CosAuthAdminHandler extends Handler {
    @route('contestId', Types.ObjectId)
    async get(domainId: string, contestId: ObjectId) {
        const contest = await ContestModel.get(domainId, contestId);
        if (!this.user.own(contest)) {
            throw new ContestNotFoundError(contestId);
        }
        const config: COSConfig = global.Hydro.lib.cosStsAuthConfig;
        const allowPrefix = `${config.allowPrefix.split('/monitor')[0].replace('contestId', contestId.toString())}/*`;

        this.response.body = {
            data: await getAuthCredential({
                ...config,
                allowPrefix,
                allowActions: [
                    // 上传操作权限
                    'name/cos:GetBucket',
                    'name/cos:HeadObject',
                    'name/cos:ListMultipartUploads',
                    'name/cos:ListParts',
                    'name/cos:PutObject',
                    'name/cos:PostObject',
                    'name/cos:InitiateMultipartUpload',
                    'name/cos:UploadPart',
                    'name/cos:CompleteMultipartUpload',
                    'name/cos:GetObject', // 读取对象
                    'name/cos:GetObjectAcl', // 获取对象 ACL
                    'name/cos:ListBucket', // 列出 Bucket 中的对象
                    'name/cos:ListBucketVersions', // 列出版本（可选）
                ],
            }),
        };
    }

    @route('contestId', Types.ObjectId)
    @param('urlB', Types.String)
    async post(domainId: string, contestId: ObjectId, urlB: string) {
        return {
            data: {
                domainId,
                contestId,
                urlB,
            },
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('monitor-auth', '/monitor/:contestId', CosAuthHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('monitor-auth', '/monitor/:contestId/admin', CosAuthAdminHandler, PERM.PERM_VIEW_CONTEST);

    global.Hydro.lib.cosStsAuthConfig = {
        secretId: await SystemModel.get('iai.secretId'),
        secretKey: await SystemModel.get('iai.secretKey'),
        proxy: '',
        durationSeconds: 1800, // 临时密钥有效期
        bucket: await SystemModel.get('iai.bucket'),
        region: await SystemModel.get('iai.region'),
        allowPrefix: 'contest/contestId/monitor/user/userId/*', // 允许上传的文件前缀
        // 密钥的权限列表
        allowActions: [
            // 上传操作权限
            'name/cos:PutObject',
            // 'name/cos:PostObject',
            // 'name/cos:InitiateMultipartUpload',
            // 'name/cos:ListMultipartUploads',
            // 'name/cos:ListParts',
            // 'name/cos:UploadPart',
            // 'name/cos:CompleteMultipartUpload',
        ],
    };
    global.Hydro.lib.cosContestCheckConfig = {
        credential: {
            secretId: await SystemModel.get('iai.secretId'),
            secretKey: await SystemModel.get('iai.secretKey'),
        },
        region: await SystemModel.get('iai.region'),
        profile: {
            httpProfile: {
                endpoint: 'iai.tencentcloudapi.com',
            },
        },
    };
}
