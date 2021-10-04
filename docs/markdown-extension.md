# Markdown 扩展
除了 [基础的 Markdown](https://www.markdownguide.org/basic-syntax/) 语法，TDK 还提供了许多扩展语法。多数的扩展语法和其它 Markdown 扩展是兼容的。

## 自动生成目录
当页面有多个标题，TDK 会自动生成目录，默认 H2-H4 级别的标题会被添加到目录，并生成序号和描点链接。

要禁止生成目录，可以在文件最开头配置：
```md
---
toc: false # 或者配置 3，表示最多生成到 <h3> 的目录
---
```

要自定义每个标题的描点链接，可在标题后插入 `{#期望的描点}`，比如:
```md
## 怎么上飞机 {#how-to-on-ms-fei}
```

要禁止某个标题出现在目录中，可以在标题后插入 `{-}`:
```md
## 普通标题 {-}
```

默认标题前会添加如 “一”、“二”、“三” 的序号，要禁止生成序号，可以在文件最开头配置：
```md
---
counter: false
---
```

## 链接
链接分站外链接和站内链接。
站外链接默认在新窗口打开。
站内链接需要使用目标源文件的相对地址（比如 .md 文件），编译后它们将自动转换为 .html 后缀。
```md example .doc
[TDK GitHub](https://github.com/Teal/TDK)

[TDK 的优势](./features.md)
```

#### `{@link}` 指令
除了使用 Markdown 标准链接，还可以使用 `{@link}` 指令，只需指定目标地址，系统会自动补齐文案：

```md example .doc
链接到本页其它描点：{@link #链接}

链接到其它页：{@link ./features.md#快}
```

> [!] 注意其它页面的链接必须以 `./` 或 `../` 开头。

#### API 链接
使用  `{@link}` 指令链接到一个 API 的文档：
```md example .doc
链接到本页的 API：{@link #Button.onClick}

链接到其它页的 API：{@link ./api.ts#Button.onClick}
```

## 图片

### 占位图
如果图片的地址是 `数字x数字` 的格式，则会自动生成对应宽高的占位图：

```md example .doc
这里一张宽 200、高 100 的图：![插图](200x100)
```

### 图片标题
如果图片单独成段（即上下空一行，且该行除了图片，没有其它内容），则图片会居中显示并显示标题，其中 `#` 会自动转换为页内图片的序号：

```md example .doc
![图#：大图](200x100)

![图#：小图](100x100)
![图#：小图](100x100)
```

## 表格

### 基本表格
可使用 GitHub 风格的表格：
```md example .doc
| 左对齐 | 居中对齐  | 右对齐 |
| ------ | :-------: | -----: |
| 行1-1  |   行1-2   |  行1-3 |
| 行2-1  | **行2-2** |  行2-3 |
| 行3-1  | 转义的 \| |  行3-3 |
```

> [i] 如果希望在表格内显示 `|` 本身，需要写成 `\|`。

### 多行和跨行
在每行末尾追加转义符 `\`，则下一行内容和当前行内容会合并显示。
如果下一行内容是 `^^`，则该行和上行单元格合并。

```md example .doc
| 1     |   2   |     3 |
| ----- | :---: | ----: |
| - 列1 | 行1-2 | 行1-3 | \ |
| - 列2 |       |       |
| 行2   | 行2-2 | 行2-3 |

| 1     |   2   |     3 |
| ----- | :---: | ----: |
| - 列1 | 行1-2 | 行1-3 |
| - 列2 |  ^^   |    ^^ |
| 行2   | 行2-2 | 行2-3 |
```

### 合并单元格
如果某列没有内容，则该列会和前一列合并。

```md example .doc
|     |       2     ||
| 1   |  2-1  |  2-2 |
| --- | :---: | ---: |
| 行1 |  行1  |  行1 |
| 行2 |  行2  |      |
```

### 表格标题
在表格前或后插入 `[标题]`，将作为表格的标题，其中 `#` 会自动转换为页内表格的序号：
```md example .doc
| 1     | 2     | 3     |
| ----- | ----- | ----- |
| 行1-1 | 行1-2 | 行1-3 |
| 行2-1 | 行2-2 | 行2-3 |
[表#：标题]
```

## TODO 列表
可使用 GitHub 风格的 TODO 列表：
```md example .doc
\- [ ] 1
\- [x] 2
\- [ ] 3
	- [ ] 3-1
	- [x] 3-2
```

## 代码块

### 语法高亮
在代码块的反引号后紧跟语言名，可以添加语法高亮：

````md example .doc
```jsx
var div = <div>Hello</div>
```
````

> TDK 内部使用了 [Prism.js](https://prismjs.com/) 实现语法高亮，[查看支持的语言列表](https://prismjs.com/#languages-list)。

### 高亮行
在代码开头添加 `>`、`+` 或 `-`，**并紧跟一个空格或制表符**，可以高亮该行：

````md example .doc
```jsx
import { render, VNode, Control } from "~/admin/control"

class A extends Control {
\>	render() {
\>		return <h1>Hello, </h1>
\>	}
}

render(<A>
\+	<span>me</span>
\-	<span>you</span>
</A>, document.body)
```
````

> [i] 如果不希望行首的 `>`、`+` 或 `-` 作为高亮的标记，应在该字符前添加反斜杠 `\`。

### 限制代码块高度
在代码块的反引号后添加 `scrollable`，可以在代码太长时显示垂直滚动条：

````md example .doc scrollable
```jsx scrollable
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长
很长的代码
```
````

在代码块的反引号后添加 `> 标题` 或 `^ 标题`，整个代码块将被折叠：

````md example .doc
```jsx > 查看代码
var div = <div>Hello world</div>
```

```jsx ^ 默认展开
var div = <div>Hello world</div>
```
````

### 行号
鉴于在文档中显示的代码一般不会太长，暂时不支持显示行号。〖有意向协助我们开发? {@link ./join.md}〗

## 在线效果演示
在代码块的反引号后添加 `demo`，则该段代码会被执行并显示最终效果。
目前仅支持在线执行 HTML(`html`/`md`) 和 JS(`js`/`ts`/`jsx`/`tsx`) 代码。

### 在线执行 HTML
````md example .doc
```html demo
<button onclick="hello()">演示</button>

<script>
	function hello() {
		alert("hello")
	}
</script>
```
````
HTML 中内联的 `<script>` 会按 `tsx` 语法编译，支持 `import`。
内联的 `<style>` 标签暂时不支持编译。

### 在线执行 JS
JS 代码中需要使用 `__root__` 表示渲染的目标节点 ID，如果代码中没有出现 `__root__`，则不会显示一个演示区域(但代码依然会执行)：
````md example .doc
```js demo
__root__.innerHTML = `<button>演示</button>`
```
````

> [i] 如果你正在使用 React，一般需要这样写：
> ```jsx
> ReactDOM.render(<h1>Hello</h1>, __root__)
> ```

JS/TS 代码会通过 TypeScript 编译器编译为 ES6 然后在浏览器执行。
代码中可以使用 `import`，它将相对于当前 markdown 文件解析。

### 演示区块样式
文档页面的样式并不会应用于演示区域，以避免组件样式受文档干扰。如果你需要在演示区域内启用文档页面的通用样式，应在代码块后添加 `.doc`:
````md example .doc
```html demo .doc
<button>演示</button>
```
````

### 更多区块类型
除了 `demo`，你还可以使用 `example`、`run` 或 `test` 标记以执行代码，它们的区别是：

- `demo`: 更注重效果演示，默认折叠源码（其后紧跟 `open` 则默认展开），对于设计师更友好。
- `example`: 更注重代码本身，一般以左边源码右边效果的布局展示，更适合程序员。
- `run`: 仅执行代码，不显示源码，可用于直接在 markdown 插入 HTML 代码。
- `test`: 表示一个测试用例，供组件开发者自测使用。发布后 `test` 区块默认隐藏，除非点击页面右上角菜单的“显示自测用例”。

## 强调内容
显示带背景色的区块以强调内容。
如果区块内有多行，则首行作为标题展示。

```md example .doc
> [!] 前方高能。

> [!!] 重要的提示要说三遍。

> [i] 内容待完善。

> [?] How do you do?

> [o] 建议
> 建议每天晚上 10 点准时睡觉。

> [x] 不建议
> 不建议每天晚上熬夜到 12 点以后。
```

## 自定义容器
使用 `:::` 可以插入一个自定义的容器，避免直接使用 HTML。

### 自定义属性
容器顶部可以使用 `标签名#ID.CSS类名[属性名=属性值]` 这样的 CSS 选择器语法，比如下面的 HTML 代码：
```html
<div class="doc-box">我是一个盒子</div>
<button onclick="alert(0)" id="btn">我是一个按钮</button>
```
可以改写为：

```md example .doc
::: .doc-box
我是一个盒子
:::

::: button#btn[onclick="alert(0)"]
我是一个按钮
:::
```

### 容器嵌套

当需要嵌套容器时，类似代码块的写法：

```md example .doc
:::: .doc-box.doc-info
我是外层 div
::: .doc-box.doc-error
我是内层 div
:::
::::
```

### 水平布局
当需要水平左右布局(如果页面宽度不够，依然是垂直布局)，可使用容器及分隔符：

```md example .doc
:::
左
---
右
:::
```

### TAB 标签页
当冒号后跟用 `|` 隔开的标题，整个容器显示成标签页：
```md example .doc
::: Windows | Mac
Windows 用户使用此命令
---
Mac 用户使用此命令
:::
```

### 可折叠区域
当冒号后跟 `> 标题` 或 `^ 标题`，整个容器显示成折叠区块：

```md example .doc
::: > 默认折叠
我是展开的内容
:::

::: ^ 默认展开
我是展开的内容
:::
```

## 插入图标和表情
使用 `{@icon 名字}` 可以插入一个内置图标：
```md example .doc
{@icon windows}
{@icon ios}
{@icon linux}
```

[查看内置图标列表](../assets/icons.html)

暂时不支持 Emoji，建议使用输入法直接输入。

> [i] 如果不想 `{@icon }` 解释为指令，可以使用 `` `{@icon }` ``

## 更多功能
TDK 内部使用了 [Markdown-it](https://github.com/markdown-it/markdown-it) 编译 Markdown，你可以参考 {@link ./configuration.md} 使用其它 [Markdown-it 插件](https://www.npmjs.org/browse/keyword/markdown-it-plugin)。