# 添加组件
使用 `tdk add` 可以添加新组件：
```bash
tdk add ui/button 按钮
```

系统会创建以下文件：
```
components/ui/button/button.ts
components/ui/button/button.md
components/ui/button/package.json
```

### 定制模板
当添加 ui/button 时，系统会依次查找以下文件夹：
```
components/ui/.tpl
components/.tpl
```

模板文件夹下名为 tpl 的文件会被重命名要新建的模块名。

每个文件内包含以下标记的内容会被替换：

| 标记            | 用途                        |
| --------------- | --------------------------- |
| `__name__`        | 新建的组件名                |
| `__nameLower__`   | 新建的组件名(小写)          |
| `__namePascal__`  | 新建的组件名(首字母大写)    |
| `__displayName__` | 新建的组件展示名            |
| `__author__`      | 组件作者（从 GIT 获取）     |
| `__email__`       | 组件作者邮箱（从 GIT 获取） |
| `__version__`     | 版本号，默认为 0.0.1        |
| `__date__`        | 当前日期                    |

以上所有标记都可以在创建时添加同名参数指定，比如 `tdk add button --version 1.0`