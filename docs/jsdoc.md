# JSDoc 文档注释
TDK 采用了和 `JSDoc`/`TSDoc` 兼容的注释规范，它们也同样适用于 VSCode 的智能提示。

## 文档注释
文档注释必须以 `/**` 开头、`*/` 结尾，放置于需要标注的函数、类、变量等成员之前：
```js
/** 表示一个坐标 */
class Point {
	/**
	 * X 坐标
	 * @type {number}
	 */
	x
	/**
	 * Y 坐标
	 * @type {number}
	 */
	y
	/**
	 * 初始化新的 `Point` 类
	 * @param {number} x X 坐标
	 * @param {number} y Y 坐标
	 */
	constructor(x, y) {
		[this.x, this.y] = [x, y]
	}
}
```

文档注释每行的开头可以插入一个 `*` 用于美观，它在解析文档时会被忽略。

在文档注释每行开头可以插入一个 `@标签`，用于标记紧跟内容的含义，比如 `@param` 表示用于解释特定参数的文档注释。

文档注释的文案部分可使用 {@link ./markdown-extension.md} 语法。

## 使用 TypeScript 简化注释
如果你正在使用 TypeScript，则很多信息可以从 TypeScript 的语法获取，不需要额外的注释，多余的注释也会被忽略：
```ts
/** 表示一个坐标 */
class Point {
	/**
	 * 初始化新的 `Point` 类
	 * @param x X 坐标
	 * @param y Y 坐标
	 */
	constructor(readonly x: number, readonly y: number) { }
}
```

## 成员列表
当为一个文件提取 API 文档时，系统会首先计算要列出的成员列表。
如果源码出现了 `import/export` 语句，它是一个 ES6 模块，只有使用 `export` 导出的成员才会被列出。
否则这是一个传统 JS 文件，全局的成员都会被列出。

默认地，私有成员会被忽略。被 TypeScript 标记为 `private`、被注释标记为 `/** @private */` 或 ES2019 的私有字段 `#field` 都是私有成员。

你还可以手动指定 `/** @ignore */` 忽略任何成员。

## 全局标签
系统内置了很多标签，用于扩展文档效果。其中多数标签和 JSDoc 是兼容的。

### `@summary`
成员信息概述，用于一句话解释这个函数、类是干什么的。

一般地，你不需要手动使用 `@summary`，因为它是默认标签：
```js
/** 我是 summary */
function hi() {} 

// 等价于：
/** @summary 我是 summary */
function hi() {} 
```

在描述中间，可以使用 {@link ./markdown-extension.md} 语法。
当出现多个 `@summary` 标签，它们的内容会被合并。

### `@description`、`@desc`、`@remarks`
成员详细说明，用于完整说明函数的用法、原理。

##### 示例
```js
/**
 * 显示农历
 * @description
 * 农历是中国传统历法，是根据月亮的周期变化而发明的一种计时方法。
 */
function showLunar() {}
```

在描述中间，可以使用 {@link ./markdown-extension.md} 语法。
当出现多个 `@description` 标签，它们的内容会被合并。

### `@example`
用于编写用法示例。

如果 `@example` 后只有一行内联代码，它将按 TSX 代码高亮：
```js
/**
 * 计算两个数的和
 * @example sum(1, 2)
 * @example sum("1", "2")
 */
function sum(x, y) {}
```

如果 `@example` 有多行，则第一行作为标题，后续内容按 TSX 代码高亮：
```js
/**
 * 计算两个数的和
 * @example 示例：如何计算 1 + 2
 * sum(1, 2)
 */
function sum(x, y) {}
```

如果 `@example` 有多行，且后续内容存在 `##` 或 `` ``` ``，则它将按 Markdown 内容处理：
```js
/**
 * 计算两个数的和
 * @example ###### 示例：如何计算 1 + 2
 * ```html
 * <button click="alert(sum(1, 2))"></button>
 * ```
 */
function sum(x, y) {}
```

### `@see`
指定和当前成员相关的参考链接。
链接内容的语法同 [`@link`](#link)

##### 示例
```js
/**
 * 显示农历
 * @see http://wiki.com/lunar
 * @see #getLunar
 */
function showLunar() {}
```

### `@deprecated`
指定当前成员已废弃，在未来版本可能会删除。

`@deprecated` 后可选地添加提示，告诉用户当前成员被废弃后的替代方式。

##### 示例
```js
/**
 * @deprecated
 */
function showLunar() {}

/**
 * @deprecated 请使用 `getLunar()`
 */
function showLunar2() {}
```

### `@since`
指定首次添加当前成员的版本号。
提示用户仅在升级到指定版本后才能使用当前成员。

##### 示例
```js
/**
 * @since 1.2
 */
function showLunar() {}
```

### `@experimental`、`@beta`
提示用户当前成员正在试验阶段。

##### 示例
```js
/**
 * @experimental
 */
function showLunar() {}
```

### `@category`
指定当前成员的分类，在文档中会将相同分类的成员放在一起，并添加标题。

##### 示例
```js
/**
 * @category Display
 */
function showLunar() {}
```

### `@ignore`、`@hidden`、`@todo`
在文档上隐藏当前成员。

##### 示例
```js
/**
 * @ignore
 */
function showLunar() {}
```

## 修饰符标签

### `@public`
指示当前成员是公开的（默认）

标签后的其它文案将按 `@summary` 处理。

##### 示例
```js
/**
 * @public 显示农历
 */
function showLunar() {}
```

### `@protected`
指示当前成员只能在当前类及子类使用

标签后的其它文案将按 `@summary` 处理。

##### 示例
```js
/**
 * @protected 显示农历
 */
function showLunar() {}
```

### `@private`
指示当前成员只能在当前类内部使用，默认私有成员不会在文档内显示

标签后的其它文案将按 `@summary` 处理。

##### 示例
```js
/**
 * @private 显示农历
 */
function showLunar() {}
```

### `@internal`、`@package`
指示当前成员只供内部使用，JS 文件中，下划线开头的成员默认是内部成员。

标签后的其它文案将按 `@summary` 处理。

##### 示例
```js
/**
 * @internal 显示农历
 */
function showLunar() {}
```

### `@access`
指定可访问性，其后可跟 `public`、`protected`、`private`、`internal` 或 `package`。

##### 示例
```js
/**
 * @access protected
 */
function showLunar() {}
```

### `@final`、`@sealed`
指定当前成员不可继承。

##### 示例
```js
/**
 * @final
 */
class Factory {}
```

### `@readonly`
指定当前成员是只读的。

- 如果变量是只读的，它表示一个常量；
- 如果字段是只读的，它表示该字段只能在类内部读写，外部只读；
- 如果函数是只读的，表示这个函数没有副作用；
- 如果类是只读的，表示一个不可变的类（immutable）

##### 示例
```js
/**
 * @readonly
 */
var a = 1
```

### `@abstract`
指定当前成员是抽象的，期望被继承。

##### 示例
```js
/**
 * @abstract
 */
class Factory {}
```

## 特定成员标签

### `@param`
指定参数的说明。

使用 `@param {类型} 参数名 参数说明` 的语法标注特定参数的说明，其中参数说明可以使用 {@link ./markdown-extension.md} 语法：
```js
/**
 * @param {number} x 要计算的值
 */
function abs(x) {}
```

如果参数是可选的，可以给参数名添加方括号，并可选添加默认值：
```js
/**
 * @param {number} [x] 要计算的值
 * @param {boolean} [sign=true] 符号
 */
function abs(x, sign) {}
```

要解释扩展参数，同样使用参数名，要注意的是扩展参数的类型固定为数组：
```js
/**
 * @param {number[]} x 要计算的值
 */
function abs(...x) {}
```

对于析构参数，系统会根据参数标签的次序配对：
```js
/**
 * @param {[number, number]} _1 要计算的值
 * @param {{x: number, y: number}} _2 要计算的值
 */
function abs([x, y], {x, y}) {}
```

JSDoc 中类型的语法同 TypeScript。

在 TypeScript 文件中，只需指定变量名即可关联对应参数的文档，不需要其它标注。

```ts
/**
 * @param x 要计算的值
 */
function abs(x?: number) {}
```

#### 子参数
如果参数类型是一个回调或复杂对象，可以通过子参数进一步解释回调函数的参数和返回值：
```js
/**
 * @param {(item: string) => string} callback 回调函数
 * @param callback.item 每项的内容
 * @param callback.return 函数的期望返回值说明
 */
function abs(callback) {}
```

### `@returns`、`@return`
指定返回值的说明。
```js
/**
 * @returns {number} 返回值
 */
function abs(x) {}
```

一般地，系统会尝试从源码推导函数返回值类型，你无需手动标注返回类型。

当没有返回值（返回类型为 `void`）时，不应该使用 `@returns` 标签。

### `@template`、`@typeparam`
指定类型参数的说明。

对于泛型类或函数，可以使用 `@template` 解释类型参数：
```ts
/**
 * @template T 数组类型
 */
function sum<T>(arr: T[]) {}
```

### `@type`
在 JS 中指定变量或字段的类型。

```ts
/**
 * @type {number}
 */
var a
```

其中类型的语法同 TypeScript。

### `@default`
指定变量或字段的默认值。

```ts
var options = {
	/**
	 * @default "MuYou"
	 */
	name: "MuYou"
}
```

默认值应该是一个合法的 JS 表达式，即默认值是字符串时，需要加引号。

## 文档级别标签

### `@fileoverview`、`@file`
指定当前文件的用途说明。

##### 示例
```js
/**
 * @fileoverview The best framework for ....
 */
```

### `@author`
指定当前文件的作者。
每个作者写成 `名字<邮箱>(主页地址)` 的格式（其中邮箱和主页地址是可选的）。

可多次使用 `@author` 标签，表示多个作者，最靠前的为第一作者（即创建者）。

```js
/**
 * @author xuld<xuld@xuld.net>
 */
```

### `@license`、`@licence`
当前文件的开源协议。

##### 示例
```js
/**
 * @license MIT
 */
```

### `@copyright`
当前文件的版权声明。

##### 示例
```js
/**
 * @copyright 公司名
 */
```

### `@created`
当前文件的创建时间。

##### 示例
```js
/**
 * @created 2020-01-01
 */
```

### `@modified`
当前文件的最后修改时间。

##### 示例
```js
/**
 * @modified 2020-10-01
 */
```

### `@version`
当前文件的版本号。

##### 示例
```js
/**
 * @version 1.0.0
 */
```

### `@module`
指示当前文件是一个 AMD/CommonJS/ES6 模块。

##### 示例
```js
/**
 * @module
 */
```

## 内联标签

### `{@link}`
在所有的说明位置，可以使用 `{@link}` 指令链接到其它 API 页面。

链接到同文件的其它成员，使用 `#成员名`，如 `#Button.onClick`。
链接到其它文件，使用 `相对的源码地址#成员名`，如 `./button.tsx#Button.onClick`。

##### 示例
```js
/**
 * 显示 {@link #农历}
 */
function showLunar() {}
```

## 文档继承
对于子类成员来说，文档可以自动继承父类。你无需手动添加 `@inheritdoc` 标签。

## 其它标签
TDK 默认仅支持上文列出的标签。但可以通过插件扩展更多的功能。
对于不支持的标签，你仍可使它们，即使它们没有效果，但也不会影响正常标签的解析。