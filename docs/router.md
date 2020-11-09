# 路由
假设你现在的目录结构是这样的：
```
├── components/                   UI 组件
│   └── button/                   按钮组件
│       ├── button.tsx
│       ├── button.scss
│       ├── button.md
│       └── package.json
├── docs/                         教程文档
│   └── guide/
│       └── getting-started.md
└── resources/                    其它资源，比如设计稿、原型图
    └── axurerp/
        └── index.html
```

经过构建后，.ts/.md 等会被编译，并自动生成首页：
```
├── components/
│   ├── button/
│   │   ├── button.js             AMD 模块
│   │   ├── button.css
│   │   ├── index.html            button.md 作为首页会被重命名为 index.html
│   │   └── package.json
│   └── index.html                生成的组件列表页
├── docs/
│   └── guide/
│       └── getting-started.html
├── resources/
│   └── axurerp/
│       └── index.html
├── tdk/                           供文档页使用的样式、脚本
└── index.html                     生成的网站首页
```

## 默认路由
当用户请求 `http://localhost/components/button/button.js` 时，系统会尝试依次查找：
- `components/button/button.tsx`
- `components/button/button.ts`
- `components/button/button.jsx`
- `components/button/button.js`

如果存在任一项，则返回该项的编译结果并停止查找。

默认地，我们将和文件夹同名的 .md 文件作为该文件夹的首页，这样 `http://localhost/components/button` 等价于 `http://localhost/components/button/button.html`。

当请求主页 `http://localhost/` 时，默认系统会先搜索 `index.md` 或 `index.html`，如果不存在则自动生成一个首页。

你也可以通过配置将默认首页改成比如 `README.md` 或 `index.md`。

## API 文档
任何 JS/TS 文件都可以生成同名的 HTML 文件，包含其对应的 API 文档信息。要查看 `src/entry.js` 的 API 文档，直接访问 `src/entry.html`。
如果有多个同名的 JS/TS 文件，则按 `tsx > ts > jsx > js` 的顺序识别。

## 特殊内置路由
为了提供文档用的静态文件等，系统保留了 `http://localhost/tdk/` 作为内置路由，包含了：
- `tdk/assets/`: 文档用的静态文件，包括样式、脚本、图标等；
- `tdk/data/`: 生成的索引数据，包括导航索引和搜索索引等；
- `tdk/vendors/`: 依赖的第三方包打包结果，比如当项目依赖了 React，则为了在线示例正确运行所需的 React 框架代码位于此路由；
- `tdk/api/`: 本地服务器提供的接口服务。
- `tdk/unittest.html`: 单元测试入口。

## 建议的目录结构
TDK 并没有对目录结构有硬性要求。但如果你使用了我们建议的目录名，则可以减轻配置的工作。

建议的目录名如下：
```
源码类
├── components      UI 组件
├── src             框架源码
└── packages        整合多个包的源码文件夹
文档类
├── guide           简易的上手指南
├── tutorial        初级到进阶教程
└── docs            专业的文档手册
示例类
├── demo            案例演示
└── examples        供参考、学习用的示例
资源类
├── resources       资源下载（如设计图）
└── tools           在线工具
```

## 工作原理
TDK 本质是一个打包构建器，它将扫描项目里的所有文件，并根据扩展名执行不同的编译，如：
- 碰到 .jsx 就编译成 .js，使得它能够在浏览器运行，以便于在线演示；
- 碰到 .md 则生成包含导航条的完整网页；
- 碰到文件夹则尝试找相应的主页。

具体的编译规则都是可配置扩展的。默认提供的编译器则针对组件开发扩展了许多便利的功能，比如 [Markdown 扩展](./markdown-extension.md)、[JSDoc](./jsdoc.md)。