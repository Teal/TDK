# 维护目录
假设项目里有名为 docs 的根文件夹，默认系统会扫描文件夹里所有生成的 HTML 文件，并将它们显示在左侧导航。

如果你需要手动移动、分类这些目录，那需要使用索引文件。

## 索引文件
索引文件固定为根文件夹下名为 `index.md` 的文件，索引的内容则使用兼容 Markdown 列表语法的格式，比如 `docs/index.md`:
```md
# 文档列表
\- 入门
  - [TDK 介绍](introduction.md)
  - [我们的优势](features.md)
  - [快速上手](getting-started.md)
\- 使用
  - [路由](router.md)
  - [Markdown 扩展](markdown-extension.md)
  - [JSDoc 文档注释](jsdoc.md)
  - [模块解析规则](module-resolution.md)
  - [配置](configuration.md)
  - [部署](deploy.md)
```

## 自动生成索引文件
执行以下命令，可以自动创建/更新 docs 文件夹的索引：
```bash
tdk index docs
```

该命令支持以下参数：
- `--clean`、`-c`：删除无效索引
- `--no-update`：禁止更新标题
- `--no-add`：禁止添加新索引