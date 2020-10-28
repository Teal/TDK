# 快速上手
> [!] 前提条件
> TDK 需要先安装 [Node.js](https://nodejs.org/) >= 10.15，生成的网站仅支持 2019 年后发布的主流浏览器。

> [!!] 预览版
> 目前 TDK 属于内测阶段，在正式版发布之前可能存在 BUG 和不兼容的改动。

## 安装
推荐全局安装 TDK，这样不需要在每个项目重新安装：
```bash
npm i tdk -g
```

> 你也可以使用 `npm i tdk --save-dev` 本地安装，然后使用 `node ./node_modules/tdk/dist/cli.js` 代替全局的 `tdk` 命令。

## 本地预览文档
无需配置，直接进入到你的项目根目录（或建一个空文件夹），然后执行：
```bash
tdk start --open .
```
执行后会自动在浏览器打开生成的文档首页。

服务器会持续监听项目内的文件，并在文件被修改后实时显示最新的文档内容。

## 发布文档
使用以下命令将文档全部导出到 `dist`，然后将内部所有文件上传到你的静态资源服务器即可供他人访问：
```bash
tdk build
```
你还可以参考 {@link ./deploy.md} 的教程将文档部署到 GitHub 或其它服务器。

现在你已经学会了如何快速生成首页和文档，接下来你可以：
- 了解用于生成文档的 {@link ./markdown-extension.md} 和 {@link ./jsdoc.md} 语法；
- 进一步了解文档的 {@link ./router.md} 和 {@link ./configuration.md}。