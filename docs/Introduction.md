# TDK 介绍
TDK(**T**ealUI **D**evelopment **K**it) 是一个**零配置**的前端组件化解决方案，主要用于以下四个场景：

::::: {.doc-grid}
:::: {a.doc-card[href="#apidoc"]}
::: {.doc-card-body}
### 提取 API 文档 {-}
扫描现有源码注释，并自动提取 API 文档。
:::
::: {.doc-card-footer}
了解更多 {@icon arrow-right .doc-icon-arrow-right}
:::
::::
:::: {a.doc-card[href="#markdowndoc"]}
::: {.doc-card-body}
### 制作技术文档 {-}
将 Markdown 文档一键转换成包含导航、搜索的漂亮网站。
:::
::: {.doc-card-footer}
了解更多 {@icon arrow-right .doc-icon-arrow-right}
:::
::::
:::: {a.doc-card[href="#frameworkhome"]}
::: {.doc-card-body}
### 生成框架官网 {-}
一键为你的框架或组件库生成官网，包含漂亮首页、在线示例、教程和 API 手册。
:::
::: {.doc-card-footer}
了解更多 {@icon arrow-right .doc-icon-arrow-right}
:::
::::
:::: {a.doc-card[href="#uilibrary"]}
::: {.doc-card-body}
### 搭建 UI 组件库 {-}
提供开发一套组件库所需的全套工具，比如实时构建、在线演示、组件自动化测试。
:::
::: {.doc-card-footer}
了解更多 {@icon arrow-right .doc-icon-arrow-right}
:::
::::
:::::

## 提取 API 文档 {#apidoc}
目前我们支持扫描 JavaScript 或 TypeScript 代码并尽可能地从源码本身提取 API 信息。
即使你的项目没有任何注释，也能正确展示接口名和类型信息。

你可以选择性地使用 [JSDoc 风格](jsdoc.md) 的注释来丰富文档的内容，比如：
```js
/**
 * 计算两个数的和
 * @param {number} x 第一个数
 * @param {number} y 第二个数
 * @returns 返回和
 */
function sum(x, y) {
	return x + y
}
```
如果你正在使用 TypeScript，则类型信息可以自动从源码获取，不需要额外的注释说明。

你只需按 [快速上手](getting-started.md) 的流程操作一遍，既可以体验一键从 .js/.jsx/.ts/.tsx 生成 API 文档。

## 制作技术文档 {#markdowndoc}
你可以使用 [扩展的 Markdown 语法](./markdown-extension.md) 编写文档，然后通过 TDK 管理文档索引，并转换成包含导航和搜索的漂亮网站。

如果配合 GIT 钩子，可以很方便的实现团队内共享文档。

你只需按 [快速上手](getting-started.md) 的流程操作一遍，既可以体验一键从 .md 生成漂亮文档网站。

## 生成框架官网 {#frameworkhome}
想要迫不及待地发布你的框架，但又不想花大量时间去设计宣传网站？

TDK 会自动读取 package.json 中的项目信息，生成一个漂亮的产品首页，扫描 `src` 下的 JS 代码提取 API 文档，并根据 `docs` 文件夹下的 .md 文件生成教程。

你只需按 [快速上手](getting-started.md) 的流程操作一遍，既可以体验一键生成官网。

## 搭建 UI 组件库 {#uilibrary}
TDK 的开发初衷就是为了帮助前端团队快速搭建内部的 UI 组件库。

要开发一套好用的组件库，你需要：
1. 一个脚手架，支持 TS、SCSS、Less 等语言的实时编译；
2. 一个编写组件示例的工具，并能实时预览效果；
3. 一个自动生成 API 文档的工具，节约写组件文档的时间；
4. 一个组件自动化测试和覆盖率测试的工具，保障组件的质量；
5. 一些常用工具，比如新建组件、图标管理；

TDK 提供了以上所有功能，自带秒启的构建服务器、开箱即用的文档生成、自动化测试和其它配套工具。

TDK 适用于任何开发框架（包括自研框架），已内置对 React 和 JSX 的支持。如果你正在使用 Vue 或 Angular，可以安装对应的插件(暂未提供〖有意向协助我们开发? {@link ./join.md}〗)。

要开始体验，请点击 [快速上手](./getting-started.md) 。