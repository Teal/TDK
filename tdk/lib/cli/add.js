import { formatTree } from "tutils/ansi";
import { capitalize } from "tutils/misc";
import { containsPath, getDir, getName, joinPath, normalizePath, relativePath, resolvePath } from "tutils/path";
import { exec } from "tutils/process";
import { Builder } from "../builder";
import { readConfigs } from "../configs";
import { formatMarkdownList } from "../shared/markdownList";
import { findContainer } from "./index";
export default async function (options) {
    var _a, _b;
    const url = options[1];
    if (!url) {
        console.info(`用法: tdk add <模块路径> [模块名]`);
        console.info(`  如: tdk add ui/textBox 文本框`);
        return 0;
    }
    const list = await add(url, {
        name: options["--name"],
        displayName: options[2],
        description: options[3],
        author: (_a = options["--author"]) !== null && _a !== void 0 ? _a : exec("git config user.name").result.stdout,
        email: (_b = options["--email"]) !== null && _b !== void 0 ? _b : exec("git config user.email").result.stdout,
        version: options["--version"],
        date: options["--date"],
        tpl: options["--tpl"]
    }, !options["--no-update-index"], options["--root"]);
    if (!list) {
        console.error(`模块已存在: ${url}`);
        return 1;
    }
    if (!list.length) {
        console.error(`模块文件夹为空或不存在: ${url}`);
        return 2;
    }
    console.info(`模块创建成功: ${url}`);
    console.info(formatTree(listToTree(list)));
    return list.length;
}
export const description = "创建一个模块";
export const argument = "模块名";
/**
 * 创建一个模块，返回新建的文件列表，如果目标模块已存在则返回空
 * @param url 要新建的模块地址
 * @param options 附加选项
 * @param updateIndex 是否添加到索引
 * @param root 根文件夹
 */
export async function add(url, options = {}, updateIndex = true, root) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    url = normalizePath(url);
    const builder = new Builder(readConfigs());
    root !== null && root !== void 0 ? root : (root = builder.options.srcDir);
    const dir = resolvePath(root, url);
    if (await builder.fs.existsDir(dir)) {
        return null;
    }
    const name = (_a = options.name) !== null && _a !== void 0 ? _a : getName(url);
    const data = {
        path: url,
        dir: getDir(url),
        name,
        nameLower: name.toLowerCase(),
        namePascal: capitalize(name),
        displayName: (_b = options.displayName) !== null && _b !== void 0 ? _b : name,
        description: (_c = options.description) !== null && _c !== void 0 ? _c : "",
        author: (_d = options.author) !== null && _d !== void 0 ? _d : "",
        email: (_e = options.email) !== null && _e !== void 0 ? _e : "",
        version: (_f = options.version) !== null && _f !== void 0 ? _f : "0.0.1",
        date: (_g = options.date) !== null && _g !== void 0 ? _g : new Date().toLocaleDateString(),
    };
    let tpl = options.tpl;
    if (tpl == undefined || !/[\\\/]/.test(tpl)) {
        tpl = (_h = await findTPLDir(getDir(dir), tpl !== null && tpl !== void 0 ? tpl : ".tpl")) !== null && _h !== void 0 ? _h : __dirname + "/../../tpl";
    }
    const list = [];
    await builder.fs.walk(tpl, {
        async file(path) {
            const targetPath = `${dir}/${relativePath(tpl, path).replace("tpl", name)}`;
            if (await builder.fs.writeFile(targetPath, renderTPL(await builder.fs.readText(path), data), false)) {
                list.push(targetPath);
            }
        }
    });
    if (updateIndex) {
        const index = await builder.docCompiler.loadPageIndex(root);
        if (!index.autoGenerated) {
            findContainer(index.items, url).push({
                title: data.displayName,
                subtitle: data.namePascal,
                url: url
            });
            await builder.fs.writeFile(index.path, index.header + formatMarkdownList(index.items) + index.body);
            list.push(index.path);
        }
    }
    return list;
    async function findTPLDir(dir, tplDirName) {
        const path = joinPath(dir, tplDirName);
        if (await builder.fs.existsDir(path)) {
            return path;
        }
        const parent = getDir(dir);
        if (!containsPath(builder.options.baseDir, parent, builder.fs.isCaseInsensitive)) {
            return null;
        }
        return findTPLDir(parent, tplDirName);
    }
}
/**
 * 渲染一个模板
 * @param tpl 模板内容
 * @param data 模板数据
 */
function renderTPL(tpl, data) {
    return tpl.replace(/__(\w+)__/g, (all, field) => { var _a; return (_a = data[field]) !== null && _a !== void 0 ? _a : all; });
}
function listToTree(list) {
    const tree = [];
    const stack = [];
    for (const item of list) {
        const parts = item.split("/");
        let index = 0;
        while (index < stack.length && stack[index] === parts[index]) {
            index++;
        }
        stack.length = index;
        while (index < parts.length) {
            stack.push(parts[index]);
            tree.push({ indent: index + 1, label: parts[index] });
            index++;
        }
    }
    return tree;
}
//# sourceMappingURL=add.js.map