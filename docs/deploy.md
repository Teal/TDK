# 部署

## 部署到 GitHub 静态页
你可以将生成的文档发布到 `https://<用户名>.github.io/` 供用户直接访问。

### 设置基路径
如果要发布的路径是 `https://<用户名>.github.io/`，则可以跳过本步。

如果要发布到 `https://<用户名>.github.io/<仓库名>/`，你需要将基路径配置为 `/<仓库名>/`:

在 `package.json` 添加：
```json
{
	"tdk": {
		"doc": {
			"baseURL": "/<仓库名>/"
		}
	}
}
```

### 生成文档
先将文档生成到 `dist` 文件夹：
```bash
cd <项目根文件夹>
tdk build
```

### 上传文档
使用 GIT 提交生成的文件：

```bash
cd dist
git init
git add -A
git commit -m "部署"
```

如果要发布到 `https://<用户名>.github.io/`，需要将 `dist` 文件夹的文件推送到 `github.com/<用户名>/<用户名>.github.io` 仓库的 `master` 分支：
```bash
git push -f git@github.com:<用户名>/<用户名>.github.io.git master
```

如果要发布到 `https://<用户名>.github.io/<仓库名>/`，你需要将 `dist` 文件夹的文件推送到当前仓库的 `gh-pages` 分支：
```bash
git push -f git@github.com:<用户名>/<仓库名>.git master:gh-pages
```

推送成功后稍等片刻，即可使用访问域名验证文档。

### 绑定域名(可选)
在文档分支根目录新建名为 `CNAME`，内容为域名地址的文件：

```bash
echo www.example.com > CNAME
git add -A
git commit -m "设置域名"
git push -f git@github.com:<用户名>/<用户名>.github.io.git master
```

### 设置自动部署(可选)
在项目根目录新建 `.travis.yml`:
```yml
language: node_js
node_js:
  - lts/*
install:
  - npm install tdk
script:
  - tdk build
deploy:
  provider: pages
  skip_cleanup: true
  local_dir: dist
*  github_token: $GITHUB_TOKEN
  keep_history: true
  on:
    branch: master
```
其中 `$GITHUB_TOKEN` 要在 GitHub/个人中心/Tokens 中生成，用于授权 Travis 向你的仓库推送代码。

之后每次推送后，都会自动将文档同步到站点。

## 部署到其它静态服务器

### 设置基路径
如果要发布的路径是 `https://docs.example.com/`，则可以跳过本步。

如果要发布到 `https://docs.example.com/<子路径>/`，你需要将基路径配置为 `/<子路径>/`:

在 `package.json` 添加：
```json
{
	"tdk": {
		"doc": {
			"baseURL": "/<子路径>/"
		}
	}
}
```

### 生成文档
先将文档生成到 `dist` 文件夹：
```bash
cd <项目根文件夹>
tdk build
```

### 上传文档
使用 FTP 或其它方式将 `dist` 文件夹的文件上传到服务器的 `wwwroot` 目录。