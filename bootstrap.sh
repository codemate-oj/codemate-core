# 假定在安装好了Node和Yarn的环境中

yarn install
yarn build:ui:gulp
yarn build:ui:production:webpack

yarn hydrooj addon add @hydrooj/ui-default

# 从环境变量读取URI，否则使用默认值
# 将URI写入配置
echo "{\"uri\": \"mongodb://root:admin@mongo:27017/\"}" > /root/.hydro/config.json
