#!/bin/bash

# 创建必要的目录和配置文件
mkdir -p ~/.hydro
echo '["@hydrooj/ui-default"]' > ~/.hydro/addon.json
echo '{"uri": "mongodb://admin:admin@localhost:27017/hydro?authSource=admin"}' > ~/.hydro/config.json

# 安装 zsh 和 oh-my-zsh
sudo apt-get update && sudo apt-get install -y zsh curl git
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# 安装 zsh-autosuggestions 插件
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# 安装 zsh-syntax-highlighting 插件
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

# 更新 .zshrc 文件以启用插件
sed -i 's/plugins=(git)/plugins=(git zsh-autosuggestions zsh-syntax-highlighting)/' ~/.zshrc

# 确保 zsh 是默认shell
chsh -s $(which zsh)

# 安装 yarn 依赖
yarn install