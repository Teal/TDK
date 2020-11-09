# 单元测试
每个 JS 源码可以添加添加同名的 `.test.js` 文件，该文件将自动识别为测试用例。

## 添加测试用例
测试用例应该是一个导出的函数，内部使用内置的 `assert` 模块进行检测：

```js
import * as assert from "assert"

export function helloTest() {
	assert.strictEqual(1, 1)
}
```

## 异步测试
函数可以返回 `Promise` 对象表示正执行异步测试：
```js
import * as assert from "assert"

export async function helloTest() {
	assert.strictEqual(1, 1)
}
```

## 特殊钩子
以下四个函数被用于特殊功能：
| 函数         | 功能                   |
| ------------ | ---------------------- |
| `before`     | 执行所有测试用例前执行 |
| `after`      | 执行所有测试用例前执行 |
| `beforeEach` | 执行每个测试用例前执行 |
| `afterEach`  | 执行每个测试用例前执行 |

## 执行测试
点击源码生成的 API 文档顶部菜单下的“测试用例”，或直接在浏览器打开 `/tdk/unittest.html`，可以执行测试用例。