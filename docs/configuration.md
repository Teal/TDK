# 配置
TDK 会根据目录结构自动配置，使得多数用户可以零配置开箱即用。
通过配置，你可以定制生成的文档的部分文案和样式。
但如果想拥有更深层的定制，只能通过插件实现。

## 配置文件
TDK 没有独立的配置文件，而是直接通过 NPM 使用的 `package.json` 的 `tdk` 字段配置的：
```json
{
	"tdk": {
		/* 这里放 TDK 的配置 */
	}
	/* ...package.json 中的其它内容 */
}
```

每次执行 `tdk` 命令时都会读取 `package.json` 中的配置。

> [i]配置文件不支持热加载，修改配置后需要重新启动开发服务器生效。

## 常用配置
> [i] 文档待完善。〖帮助我们完善 {@link ./join.md}〗

## 更多配置
见 [BuilderOptions](../src/builder.html#BuilderOptions)。