import { readFileSync } from "fs";
import { ansiToHTML } from "tutils/ansi";
import { quoteCSSString } from "tutils/css";
import { quoteHTMLAttribute } from "tutils/html";
import { quoteJSString } from "tutils/js";
import { Fragment, HTML, jsx } from "tutils/jsx";
import { Matcher } from "tutils/matcher";
import { capitalize, pushIfNotExists } from "tutils/misc";
import { containsPath, getDir, getExt, getName, getRoot, joinPath, pathEquals, relativePath, resolvePath, setExt, setRoot } from "tutils/path";
import { isAbsoluteURL, isExternalURL } from "tutils/url";
import { formatNaturalNumberToChinese } from "../shared/chinese";
import { parseEmmet } from "../shared/emmet";
import { blockquote, code, container, embed, heading, html, image, link, MarkdownCompiler, parmalink } from "../shared/markdownCompiler";
import { parseMarkdownList } from "../shared/markdownList";
import { parseMarkdownMeta } from "../shared/markdownMeta";
import { SearchIndexManager } from "../shared/searchIndexManager";
import { parseSVGSprite } from "../shared/svgSprite";
import { highlight, normalizeLanguage, removeHighlightMarkers } from "../shared/syntaxHighlighter";
import { TOCManager } from "../shared/tocManager";
import { TypeScriptDocParser } from "../shared/typeScriptDocParser";
/** 表示一个文档编译器 */
export class DocCompiler {
    /**
     * 初始化新的编译器
     * @param builder 所属的构建器
     */
    constructor(builder) {
        var _a;
        var _b;
        this.builder = builder;
        // #region 编译 Markdown
        /** 获取编译器的选项 */
        this.options = {
            baseURL: "/",
            repositoryPath: "",
            branch: "master",
            maxTOCLevel: 4,
            counter: true,
            backToTop: true,
        };
        /** 每个页面对应的搜索关键字 */
        this.searchKeywords = Object.create(null);
        Object.assign(this.options, builder.options.doc);
        try {
            this.icons = parseSVGSprite(readFileSync(resolvePath(builder.options.assetsDir, "icons.svg"), "utf8"));
        }
        catch (_c) {
            this.icons = Object.create(null);
        }
        (_a = (_b = this.options).logo) !== null && _a !== void 0 ? _a : (_b.logo = this.renderIcon("logo").toString());
        if (/^zh\b/.test(builder.options.locale)) {
            this.options.counter = ((counts, item) => {
                if (item.level === 0) {
                    return `${formatNaturalNumberToChinese(counts[counts.length - 1])}、`;
                }
                if (item.level === 1) {
                    return `${counts[counts.length - 1]}. `;
                }
            });
        }
        this.markdownCompiler = new MarkdownCompiler(builder.options.md)
            .use(image, token => {
            token.attrSet("class", "doc-image-zoom");
            token.attrSet("onclick", "DOC.viewImage(this)");
        })
            .use(blockquote, {
            "i": {
                class: "doc-blockquote doc-info",
                renderIcon: () => this.renderIcon("info", "doc-blockquote-icon")
            },
            "!": {
                class: "doc-blockquote doc-warning",
                renderIcon: () => this.renderIcon("warning", "doc-blockquote-icon")
            },
            "o": {
                class: "doc-blockquote doc-success",
                renderIcon: () => this.renderIcon("success", "doc-blockquote-icon")
            },
            "x": {
                class: "doc-blockquote doc-error",
                renderIcon: () => this.renderIcon("error", "doc-blockquote-icon")
            },
            "!!": {
                class: "doc-blockquote doc-error",
                renderIcon: () => this.renderIcon("alert", "doc-blockquote-icon")
            },
            "?": {
                class: "doc-blockquote doc-info",
                renderIcon: () => this.renderIcon("question", "doc-blockquote-icon")
            },
        }, () => `<div class="doc-blockquote-title">`, () => `</div>`)
            .use(container, {
            renderOpenContainer: (tokens, idx, options, context) => {
                var _a;
                const token = tokens[idx];
                const title = token.info.trim();
                if (token.meta.detail = /^[>\^]/.test(title)) {
                    return `<details${title.startsWith(">") ? "" : " open"}><summary>${this.markdownCompiler.renderInline(title.slice(1).trimStart(), context)}</summary>${token.meta.seperators ? `<div class="doc-grid">` : ""}`;
                }
                if (token.meta.tabs = title.includes("|")) {
                    return `<div class="doc-tab-header"><ul onclick="DOC.toggleTab(event.target)" role="tablist">${title.split("|").map((tab, index) => `<li tabindex="0" role="tab"${index ? "" : ` class="doc-selected"`}>${this.markdownCompiler.renderInline(tab, context)}</li>`).join("")}</ul></div><div class="doc-tab-body">`;
                }
                const emmet = parseEmmet(title, token.meta.seperators ? "doc-grid" : "");
                return `<${token.meta.tag = (_a = emmet.tagName) !== null && _a !== void 0 ? _a : "div"}${emmet.props}>`;
            },
            renderCloseContainer(tokens, idx) {
                const token = tokens[idx];
                if (token.meta.openContainerToken.meta.detail) {
                    return `${token.meta.openContainerToken.meta.seperators ? `</div>` : ""}</details>`;
                }
                if (token.meta.openContainerToken.meta.tabs) {
                    return `</div>`;
                }
                return `</${token.meta.openContainerToken.meta.tag}>`;
            },
            renderOpenSeperator(tokens, idx) {
                const token = tokens[idx];
                if (token.meta.openContainerToken.meta.tabs) {
                    return `<div class="doc-tab-content${token.meta.index ? "" : " doc-selected"}" role="tabpanel">`;
                }
                return `<div class="doc-cell">`;
            },
            renderCloseSeperator() {
                return `</div>`;
            },
        })
            .use(code, (content, info, context) => {
            const parts = info.split(/\s+/);
            const language = normalizeLanguage(parts[0]);
            const open = parts.includes("open", 1);
            const scrollable = parts.includes("scrollable", 1);
            const emmet = parseEmmet(info);
            const preClassName = `doc-code${scrollable ? " doc-code-scrollable" : ""}`;
            const bodyClassName = emmet.className;
            const codeBlockType = parts.includes("test", 1) ? 4 /* test */ :
                parts.includes("example", 1) ? 3 /* example */ :
                    parts.includes("demo", 1) ? 2 /* demo */ :
                        parts.includes("run", 1) ? 1 /* run */ : 0 /* code */;
            const compiledCode = codeBlockType !== 0 /* code */ ? this.compileEmabedCode(removeHighlightMarkers(content), language, context) : null;
            const toolbar = this.renderCodeToolBar(content, language, info, compiledCode, context);
            const sourceCode = new HTML(highlight(content, language, "doc-token-"));
            if (compiledCode) {
                const js = compiledCode.js ? jsx("script", null, new HTML(compiledCode.js)) : null;
                if (compiledCode.container) {
                    const html = compiledCode.html ? new HTML(compiledCode.html) : null;
                    if (codeBlockType === 4 /* test */)
                        context.demoForTestCount++;
                    return jsx(Fragment, null,
                        new HTML(`</div>`),
                        codeBlockType === 3 /* example */ ? jsx("div", { class: "doc-example doc-grid" },
                            jsx("div", { class: "doc-example-code doc doc-section" },
                                jsx("h5", null, "\u6E90\u7801"),
                                jsx("pre", { class: preClassName },
                                    jsx("code", { class: `doc-language-${language}`, contenteditable: "false", autocorrect: "off", autocapitalize: "off", spellcheck: "false" }, sourceCode))),
                            jsx("div", { class: "doc-example-result" },
                                jsx("div", { class: "doc doc-section" },
                                    jsx("h5", null, "\u6548\u679C")),
                                jsx("div", { id: compiledCode.container, class: `doc-run-result ${bodyClassName}` }, html),
                                js)) : codeBlockType !== 1 /* run */ ? jsx("div", { class: `doc-demo${codeBlockType === 4 /* test */ ? " doc-demo-test" : ""}` },
                            jsx("div", { id: compiledCode.container, class: `doc-run-result ${bodyClassName}` }, html),
                            jsx("details", { class: "doc-section doc doc-demo-code", open: open },
                                jsx("summary", null,
                                    toolbar,
                                    "\u67E5\u770B\u6E90\u7801"),
                                jsx("pre", { class: preClassName },
                                    jsx("code", { class: `doc-language-${language}`, contenteditable: "false", autocorrect: "off", autocapitalize: "off", spellcheck: "false" }, sourceCode))),
                            js) : jsx(Fragment, null,
                            jsx("div", { id: compiledCode.container, class: `doc-run-result ${bodyClassName}` }, html),
                            js),
                        new HTML(`<div class="doc doc-section">`));
                }
                return codeBlockType === 1 /* run */ ? js : jsx(Fragment, null,
                    jsx("pre", { class: preClassName },
                        toolbar,
                        jsx("code", { class: `doc-language-${language}` }, sourceCode)),
                    js);
            }
            const detailsMatch = /^\s*([>\^])\s*(.*)$/.exec(info.substring(parts[0].length));
            if (detailsMatch) {
                const open = detailsMatch[1] !== ">";
                return jsx("details", { class: "doc-section doc doc-demo-details", open: open },
                    jsx("summary", null,
                        toolbar,
                        this.markdownCompiler.renderInline(detailsMatch[2], context)),
                    jsx("pre", { class: preClassName },
                        jsx("code", { class: `doc-language-${language}` }, sourceCode)));
            }
            return jsx("pre", { class: preClassName },
                toolbar,
                jsx("code", { class: `doc-language-${language}` }, sourceCode));
        })
            .use(link, {
            redirect: (url, context) => {
                const href = this.parseHref(url, context).href;
                return href && !isAbsoluteURL(href) && !/^\.\/|\.\.\/|#/.test(href) ? this.options.baseURL + href : href;
            },
            externalClass: "doc-link-external",
            renderExternalIcon: () => this.renderIcon("external")
        })
            .use(embed, (type, content, context) => {
            var _a;
            switch (type) {
                case "icon":
                    const emmet = parseEmmet(content);
                    return this.renderIcon((_a = emmet.tagName) !== null && _a !== void 0 ? _a : emmet.rest, emmet.className);
                case "link":
                    return this.renderDocSeeAlso(content, context);
                default:
                    // TODO: 支持内嵌引用
                    return `{@${type} ${content}}<!-- 暂不支持 -->`;
            }
        })
            .use(html, (content, context) => this.compileEmbedHTML(content, "jsx", "scss", context))
            .use(heading, (token, content, hash, context) => {
            const titleLevel = +token.tag.slice(1) || 1;
            if (titleLevel === 1 || titleLevel > context.maxTOCLevel || hash === "-") {
                return;
            }
            hash = hash && parseEmmet(hash).id || undefined;
            const item = token.meta = context.tocManager.add(content, titleLevel - 2, hash);
            return item.anchor;
        })
            .use(parmalink, (anchor, token) => {
            var _a;
            return jsx(Fragment, null,
                anchor ? this.renderPermalink(anchor) : null,
                ((_a = token.meta) === null || _a === void 0 ? void 0 : _a.counter) ? jsx("span", { class: "doc-counter" }, token.meta.counter) : null);
        });
    }
    /**
     * 编译 Markdown 中内嵌的 JS 代码
     * @param content 要编译的代码
     * @param lang 首选的语言
     * @param context 生成 Markdown 的上下文
     */
    compileEmbedJS(content, lang, context) {
        var _a;
        if (!content) {
            return content;
        }
        const scriptID = (++context.scriptCount).toString();
        const result = this.builder.compileTypeScript(`${content}

if (typeof exports !== "undefined") {
	for (var key in exports) {
		if (window[key] === undefined) {
			window[key] = exports[key];
		}
	}
}`, `${context.sourceURL || ""}#${scriptID}.${lang}`, "transpileOnly", undefined, undefined, { sourceMap: false });
        result.content = result.content.replace(/^define\(/m, "require\(");
        if ((_a = result.errors) === null || _a === void 0 ? void 0 : _a.length) {
            result.content = this.buildErrorPage(result.errors, ".js", result.content);
        }
        return result.content.replace(/<\/script>/gi, "<\\/script>");
    }
    /**
     * 编译 Markdown 中内嵌的 HTML 代码
     * @param content 要编译的代码
     * @param script 首选的脚本语言
     * @param style 首选的样式语言
     * @param demoID 页内唯一标识
     * @param context 生成 Markdown 的上下文
     */
    compileEmbedHTML(content, script, style, context) {
        // TODO: 支持 style 使用其它语法
        return content.replace(/(<script(?:'[^']*'|"[^"]*"|[^>])*>)(.*?)(<\/script>)/sgi, (source, start, body, end) => `${start}${this.compileEmbedJS(body, script, context)}${end}`);
    }
    /**
     * 编译 Markdown 中内嵌的代码，如果不支持该语言则返回 `undefined`
     * @param content 要编译的代码
     * @param language 语言
     * @param context 生成 Markdown 的上下文
     */
    compileEmabedCode(content, language, context) {
        if (language === "js" || this.builder.getOutputNames("&." + language).includes("&.js")) {
            let container;
            content = content.replace(/\b__root__\b/g, () => container !== null && container !== void 0 ? container : (container = `doc_demo_${++context.demoCount}`));
            return {
                container,
                js: this.compileEmbedJS(content, language, context)
            };
        }
        if (language === "html") {
            return {
                container: `doc_demo_${++context.demoCount}`,
                html: this.compileEmbedHTML(content, "jsx", "scss", context),
            };
        }
        if (language === "md") {
            return {
                container: `doc_demo_${++context.demoCount}`,
                html: this.markdownCompiler.render(content, context),
            };
        }
    }
    /**
     * 渲染代码区块的工具条
     * @param content 要编译的代码
     * @param language 语言
     * @param info 代码块的信息
     * @param compiledCode 已编译的代码
     * @param context 生成 Markdown 的上下文
     */
    renderCodeToolBar(content, language, info, compiledCode, context) {
        return jsx("span", { class: "doc-toolbar" },
            jsx("button", { type: "button", "aria-hidden": "true", class: "doc-toolbar-button doc-code-tool-copy", onclick: "DOC.handleCopy(this, '\u5DF2\u590D\u5236', '\u590D\u5236\u5931\u8D25')" },
                this.renderIcon("copy"),
                jsx("span", { class: "doc-tooltip doc-arrow" }, "\u590D\u5236\u6E90\u7801")));
    }
    // #endregion
    // #region 文档页
    /**
     * 构建指定的文档页
     * @param content 要编译的 Markdown 源码
     * @param path 模块的原始绝对路径
     * @param outPath 模块的输出绝对路径
     * @param options 附加选项
     */
    async buildDocPage(content, path, outPath, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const meta = Object.assign(this.parseMarkdownMeta(content, path), options);
        const counter = (_a = meta.counter) !== null && _a !== void 0 ? _a : this.options.counter;
        const tocManager = new TOCManager(typeof counter === "function" ? counter : counter === false ? null : undefined);
        const context = {
            url: this.builder.toURL(outPath),
            sourceURL: this.builder.toURL(path),
            errors: [],
            dependencies: [],
            tocManager,
            maxTOCLevel: meta.toc === false ? 0 : typeof meta.toc === "number" ? meta.toc : this.options.maxTOCLevel,
            narrow: meta.narrow,
            demoCount: 0,
            demoForTestCount: 0,
            scriptCount: 0,
            meta: meta,
            title: meta.name ? `${meta.name} ${meta.title}` : meta.title,
            subtitle: meta.subtitle,
            state: (_b = meta.state) !== null && _b !== void 0 ? _b : "normal",
            tags: meta.tags,
            authors: (_c = meta.authors) === null || _c === void 0 ? void 0 : _c.map(item => ({ label: item.name, href: item.href })),
            changeLogs: (_d = meta.changeLogs) === null || _d === void 0 ? void 0 : _d.map(item => ({ label: item }))
        };
        // #title 固定用于标题
        tocManager.addAnchor("title");
        if (meta.keywords) {
            for (const keyword of meta.keywords) {
                this.addSearchKeyword(context.sourceURL, keyword);
            }
        }
        // 生成翻页数据
        if (meta.pager !== false && getDir(context.url)) {
            const indexURL = this.getPageIndexURL(context.url);
            if (indexURL !== context.url) {
                const listAsset = await this.builder.getAsset(indexURL);
                context.dependencies.push(...listAsset.dependencies);
                const listItems = listAsset.content["raw"].items;
                const sourceURL = setRoot(context.sourceURL, "");
                const siblings = findSiblings(listItems, sourceURL, true) || findSiblings(listItems, sourceURL, false);
                if (siblings) {
                    context.activeURL = siblings.activeURL;
                    if ((_e = siblings.prev) === null || _e === void 0 ? void 0 : _e.url) {
                        context.prevPage = {
                            label: siblings.prev.title,
                            href: getRoot(context.url) + "/" + this.builder.getHTMLOutputName(siblings.prev.url)
                        };
                    }
                    if ((_f = siblings.next) === null || _f === void 0 ? void 0 : _f.url) {
                        context.nextPage = {
                            label: siblings.next.title,
                            href: getRoot(context.url) + "/" + this.builder.getHTMLOutputName(siblings.next.url)
                        };
                    }
                }
                function findSiblings(buildList, url, equals) {
                    const it = flattern(buildList);
                    let item;
                    let prevValue;
                    while (!(item = it.next()).done) {
                        const value = item.value;
                        if (equals ? value.url === url : containsPath(url, value.url)) {
                            return {
                                activeURL: value.url,
                                prev: prevValue,
                                next: it.next().value
                            };
                        }
                        prevValue = value;
                    }
                    return { activeURL: url, prev: undefined, next: undefined };
                }
                function* flattern(buildList) {
                    for (const item of buildList) {
                        if (item.children) {
                            yield* flattern(item.children);
                        }
                        else {
                            yield item;
                        }
                    }
                }
            }
        }
        // 解析 Markdown，提取标题
        const tokens = this.markdownCompiler.parse(meta.body, context);
        // 生成 API 文档
        let api;
        if (meta.api !== false) {
            const jsAsset = await this.builder.getAsset(setExt(context.sourceURL, ".js"));
            context.dependencies.push(...jsAsset.dependencies);
            if (jsAsset.type === 1 /* file */) {
                const sourcePath = jsAsset.dependencies[jsAsset.dependencies.length - 1];
                context.codeURL = this.builder.toURL(sourcePath);
                if (!outPath.endsWith(".test.html")) {
                    context.unitTestURL = setExt(context.codeURL, ".test.js");
                }
                try {
                    api = this.renderAPIDoc(sourcePath, context);
                }
                catch (e) {
                    context.errors.push({
                        warning: true,
                        message: `无法解析 API 文档：${e}`,
                        fileName: sourcePath,
                        stack: e.stack
                    });
                }
            }
            else {
                const cssAsset = await this.builder.getAsset(setExt(context.sourceURL, ".css"));
                context.dependencies.push(...cssAsset.dependencies);
                if (cssAsset.type === 1 /* file */) {
                    context.codeURL = this.builder.toURL(cssAsset.dependencies[cssAsset.dependencies.length - 1]);
                }
            }
        }
        // 计算版本和作者
        if (meta.meta !== false && this.options.readCommits && (!((_g = context.authors) === null || _g === void 0 ? void 0 : _g.length) || !((_h = context.changeLogs) === null || _h === void 0 ? void 0 : _h.length))) {
            const commits = await this.options.readCommits([path, context.codeURL ? resolvePath(this.builder.options.baseDir, context.codeURL) : null, context.unitTestURL ? resolvePath(this.builder.options.baseDir, context.unitTestURL) : null].filter(t => t));
            const users = new Map();
            let count = commits.length;
            const versions = ((_j = context.changeLogs) === null || _j === void 0 ? void 0 : _j.length) ? undefined : context.changeLogs = [];
            for (const commit of commits) {
                const exists = users.get(commit.authorEmail);
                if (exists) {
                    exists.count++;
                }
                else {
                    users.set(commit.authorEmail, {
                        label: commit.authorName,
                        email: commit.authorEmail,
                        href: `mailto:${commit.authorEmail}`,
                        count: 1
                    });
                }
                if (versions && versions.length < 20) {
                    versions.push({ label: `${commit.date}(#${count--}, ${commit.authorName})` });
                }
            }
            if (users.size && !((_k = context.authors) === null || _k === void 0 ? void 0 : _k.length)) {
                context.authors = Array.from(users.values()).sort((x, y) => y.count - x.count);
            }
        }
        // 生成目录
        (_l = context.narrow) !== null && _l !== void 0 ? _l : (context.narrow = !(containsPath(this.builder.options.srcDir, path, this.builder.fs.isCaseInsensitive) || !content || context.codeURL));
        const toc = meta.toc !== false ? this.renderTOC(context) : null;
        return {
            content: this.renderDocPage(context.url, context.title, jsx("div", { class: `${toc ? "doc-article-has-toc" : ""}${context.narrow ? " doc-article-narrow" : ""}` },
                this.renderTools(context),
                this.renderTitle(context),
                meta.meta !== false ? await this.renderMetaInfo(context) : null,
                this.renderPageHead(context),
                toc,
                jsx("div", { class: "doc doc-section" },
                    meta.injectHead,
                    new HTML(this.markdownCompiler.renderer.render(tokens, this.markdownCompiler.options, context)),
                    api,
                    meta.injectFoot),
                this.renderPageFoot(context))),
            errors: context.errors,
            dependencies: context.dependencies
        };
    }
    /**
     * 解析 Markdown 的元数据
     * @param content 要解析的内容
     * @param path 文件的路径
     */
    parseMarkdownMeta(content, path) {
        var _a, _b, _c;
        const result = parseMarkdownMeta(content);
        (_a = result.title) !== null && _a !== void 0 ? _a : (result.title = capitalize(getName(path, false)));
        (_b = result.name) !== null && _b !== void 0 ? _b : (result.name = containsPath(this.builder.options.srcDir, path) ? capitalize(getName(path, false)) : undefined);
        if (((_c = result.name) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === result.title.toLowerCase()) {
            result.name = undefined;
        }
        return result;
    }
    /**
     * 渲染工具栏
     * @param context 当前页面的上下文
     */
    renderTools(context) {
        const tools = this.renderToolItems(context);
        return (tools === null || tools === void 0 ? void 0 : tools.length) ? jsx("div", { class: "doc-section doc-popup-trigger doc-article-tools" },
            this.renderIcon("ellipsis"),
            jsx("menu", { class: "doc-menu doc-popup doc-arrow" }, tools)) : null;
    }
    /**
     * 渲染工具栏项
     * @param context 页面的上下文
     */
    renderToolItems(context) {
        return jsx(Fragment, null,
            context.sourceURL && this.options.repository ? jsx("li", null,
                jsx("a", { href: `${this.options.repository}/edit/${this.options.branch}/${this.options.repositoryPath ? this.options.repositoryPath + "/" : ""}${context.sourceURL}`, target: "_blank", accesskey: "e" },
                    this.renderIcon("edit", "doc-icon-space-right"),
                    "\u7F16\u8F91\u6B64\u9875(E)")) : null,
            this.options.repository ? jsx("li", null,
                jsx("a", { href: `${this.options.repository}/issues/new?title=${encodeURIComponent(`BUG: ${context.title}`)}`, target: "_blank", accesskey: "b" },
                    this.renderIcon("bug", "doc-icon-space-right"),
                    "\u62A5\u544A BUG(B)")) : null,
            context.codeURL && this.options.repository ? jsx("li", null,
                jsx("a", { href: `${this.options.repository}/tree/${this.options.branch}/${this.options.repositoryPath ? this.options.repositoryPath + "/" : ""}${context.codeURL}`, target: "_blank", accesskey: "v" },
                    this.renderIcon("code", "doc-icon-space-right"),
                    "\u67E5\u770B\u6E90\u7801(V)")) : null,
            jsx("li", { class: "doc-menu-divider" },
                jsx("button", { type: "button", onclick: "DOC.handleQRCodeClick(this)", accesskey: "q" },
                    this.renderIcon("qrcode", "doc-icon-space-right"),
                    "\u4E8C\u7EF4\u7801(Q)")),
            context.demoCount ? jsx("li", null,
                jsx("button", { type: "button", onclick: "DOC.handleToggleDemoCodeClick(this)", accesskey: "c" },
                    this.renderIcon("terminal", "doc-icon-space-right"),
                    "\u5C55\u5F00\u793A\u4F8B\u6E90\u7801(C)")) : null,
            context.demoForTestCount ? jsx("li", null,
                jsx("button", { type: "button", onclick: "DOC.handleToggleDevMode(this)", accesskey: "t" },
                    this.renderIcon("test", "doc-icon-space-right"),
                    "\u663E\u793A\u81EA\u6D4B\u7528\u4F8B(T)")) : null,
            context.unitTestURL ? jsx("li", null,
                jsx("a", { href: `${this.options.baseURL}tdk/unittest.html?module=${context.unitTestURL}`, target: "unittest", accesskey: "u" },
                    this.renderIcon("unittest", "doc-icon-space-right"),
                    "\u5355\u5143\u6D4B\u8BD5(U)")) : null);
    }
    /**
     * 渲染一个标题
     * @param context 页面的上下文
     */
    renderTitle(context) {
        var _a;
        return jsx("h1", { class: "doc-section doc-article-title", id: "title" },
            this.renderPermalink("title"),
            context.title,
            context.subtitle, (_a = context.tags) === null || _a === void 0 ? void 0 :
            _a.map(tag => jsx("span", { class: "doc-tag" }, tag)),
            context.state ? {
                "developing": jsx("span", { class: "doc-tag doc-error" }, "\u5F00\u53D1\u4E2D"),
                "experimental": jsx("span", { class: "doc-tag doc-warning" }, "\u8BD5\u9A8C\u4E2D"),
                "stable": jsx("span", { class: "doc-tag doc-success" }, "\u7A33\u5B9A\u7248"),
                "deprectated": jsx("span", { class: "doc-tag doc-warning" }, "\u5DF2\u5E9F\u5F03"),
                "legacy": jsx("span", { class: "doc-tag doc-error" }, "\u5386\u53F2\u9057\u7559")
            }[context.state] : null);
    }
    /**
     * 渲染页面头信息
     * @param context 页面的上下文
     */
    async renderMetaInfo(context) {
        const metas = await this.getMetaInfo(context);
        return jsx("div", { class: "doc-section doc-article-meta" }, metas.map(([title, icon, firstItem, items]) => firstItem ? jsx("div", { class: "doc-article-meta-item" },
            jsx("label", { class: "doc-article-meta-label", title: title }, this.renderIcon(icon)),
            jsx("div", { class: `doc-article-meta-value${items.length > 1 ? " doc-popup-trigger" : ""}` },
                jsx("span", null,
                    firstItem.href ? jsx("a", { href: firstItem.href }, firstItem.label) : firstItem.label,
                    items.length > 1 ? this.renderIcon("chevron-down") : null),
                items.length > 1 ? jsx("ul", { class: "doc-popup" }, items.map(item => jsx("li", null, item.href ? jsx("a", { href: item.href }, item.label) : item.label))) : null)) : null));
    }
    /**
     * 获取页面的元数据
     * @param context 页面的上下文
     */
    async getMetaInfo(context) {
        var _a, _b;
        return [["维护", "maintainer", (_a = context.authors) === null || _a === void 0 ? void 0 : _a[0], context.authors], ["版本", "history", (_b = context.changeLogs) === null || _b === void 0 ? void 0 : _b[0], context.changeLogs]];
    }
    /**
     * 渲染一个目录
     * @param context 页面的上下文
     */
    renderTOC(context) {
        let count = 0;
        const toc = jsx("ul", { class: "doc-collapsed" },
            jsx("li", { class: "doc-toc-head" },
                jsx("a", { href: "#title" }, context.title)),
            context.tocManager.items.map(renderItem));
        const tocCollapsable = count > 4;
        if (count < 2) {
            return;
        }
        return jsx("aside", { class: `doc-section doc-toc${tocCollapsable ? " doc-collapsed" : ""}` },
            jsx("nav", { class: "doc-toc-container doc-hide-scrollbar" },
                tocCollapsable ? jsx("button", { type: "button", class: "doc-toc-title", onclick: "DOC.toggleTOCCollapse()" },
                    "\u76EE\u5F55",
                    this.renderIcon("chevron-down")) : jsx("div", { class: "doc-toc-title" }, "\u76EE\u5F55"),
                toc,
                jsx("span", { class: "doc-toc-anchor" }),
                tocCollapsable ? jsx("button", { type: "button", title: "\u5C55\u5F00\u66F4\u591A", class: "doc-toc-more", onclick: "DOC.toggleTOCCollapse()" },
                    this.renderIcon("chevron-down"),
                    this.renderIcon("ellipsis")) : null));
        function renderItem(item) {
            count++;
            return jsx("li", null,
                jsx("a", { href: "#" + item.anchor },
                    item.counter ? jsx("span", { class: "doc-counter" }, item.counter) : null,
                    item.label),
                item.items ? jsx("ul", null, item.items.map(renderItem)) : null);
        }
    }
    /**
     * 渲染页面顶部
     * @param context 页面的上下文
     */
    renderPageHead(context) {
        return context.state ? {
            "developing": jsx("div", { class: "doc" },
                jsx("blockquote", { class: "doc-blockquote doc-error" },
                    jsx("div", { class: "doc-blockquote-title" },
                        this.renderIcon("alert", "doc-blockquote-icon"),
                        "\u6B63\u5728\u5F00\u53D1\u4E2D"),
                    "\u8BF7\u4E0D\u8981\u5728\u751F\u4EA7\u73AF\u5883\u4F7F\u7528\uFF01")),
            "deprectated": jsx("div", { class: "doc" },
                jsx("blockquote", { class: "doc-blockquote doc-warning" },
                    jsx("div", { class: "doc-blockquote-title" },
                        this.renderIcon("warning", "doc-blockquote-icon"),
                        "\u5DF2\u5E9F\u5F03"),
                    "\u8BF7\u5C3D\u91CF\u4E0D\u8981\u4F7F\u7528\uFF01"))
        }[context.state] : null;
    }
    /**
     * 渲染页面底部
     * @param context 页面的上下文
     */
    renderPageFoot(context) {
        return context.prevPage || context.nextPage ? jsx("nav", { class: "doc-section doc-pager" },
            context.prevPage ? jsx("a", { href: this.options.baseURL + context.prevPage.href, title: context.prevPage.label, class: "doc-pager-prev" },
                this.renderIcon("arrow-right", "doc-icon-arrow-left"),
                "\u4E0A\u4E00\u9875: ",
                context.prevPage.label) : null,
            context.nextPage ? jsx("a", { href: this.options.baseURL + context.nextPage.href, title: context.nextPage.label, class: "doc-pager-next" },
                this.renderIcon("arrow-right", "doc-icon-arrow-right"),
                "\u4E0B\u4E00\u9875: ",
                context.nextPage.label) : null) : null;
    }
    /**
     * 渲染一个文档页
     * @param url 文档的地址
     * @param title 文档的标题
     * @param content 文档正文
     */
    renderDocPage(url, title, content) {
        return `<!DOCTYPE html>` + jsx("html", { lang: this.builder.options.locale, class: "doc-page" },
            jsx("head", null,
                jsx("meta", { charset: "UTF-8" }),
                jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
                jsx("title", null,
                    title,
                    " - ",
                    this.options.displayName),
                this.renderHead(url),
                jsx("script", { src: this.options.baseURL + this.getPageIndexURL(url), defer: true })),
            jsx("body", null,
                this.renderHeader(url),
                jsx("main", { class: "doc-body" },
                    jsx("nav", { class: "doc-section doc-sidebar" },
                        jsx("ul", { class: "doc-menu doc-hide-scrollbar doc-navmenu", onclick: "DOC.handleNavMenuClick(event)" },
                            jsx("li", null,
                                jsx("label", { class: "doc-tip" },
                                    jsx("span", { class: "doc-spinner doc-icon-space-right" }),
                                    "\u6B63\u5728\u52A0\u8F7D\u5217\u8868...")))),
                    jsx("article", { class: "doc-article" },
                        jsx("script", { src: this.options.baseURL + "tdk/assets/require.js" }),
                        new HTML(`<!--#DOC-ARTICLE-START-->`),
                        content,
                        new HTML(`<!--#DOC-ARTICLE-END-->`)),
                    this.options.backToTop ? jsx("div", { class: "doc-section doc-back-to-top" },
                        jsx("a", { href: "#", title: "\u8FD4\u56DE\u9876\u90E8", onclick: "DOC.backToTop(); return false;" }, this.renderIcon("top"))) : null),
                this.renderFooter(url),
                this.renderFoot(url)));
    }
    // #endregion
    // #region 页面模板
    /**
     * 渲染顶部的 HTML
     * @param url 当前页面的地址
     * @param pageData 页面的附加数据
     */
    renderHead(url, pageData) {
        return jsx(Fragment, null,
            jsx("link", { rel: "stylesheet", href: this.options.baseURL + "tdk/assets/doc.css" }),
            this.options.injectHead ? new HTML(this.options.injectHead) : "",
            jsx("script", null,
                "var DOC_PAGE_DATA = ",
                JSON.stringify({
                    baseURL: this.options.baseURL,
                    searchIndexURL: this.getSearchIndexURL(url),
                    pageIndexRoot: getRoot(url) + "/",
                    ...pageData
                })),
            jsx("script", { src: this.options.baseURL + "tdk/assets/doc.js", defer: true }));
    }
    /**
     * 渲染底部的 HTML
     * @param url 当前页面的地址
     */
    renderFoot(url) {
        return this.options.injectFoot ? new HTML(this.options.injectFoot) : "";
    }
    /**
     * 渲染头部
     * @param url 当前页面的地址
     */
    renderHeader(url) {
        var _a;
        return jsx("header", { class: "doc-section doc-header" },
            jsx("button", { type: "button", "aria-label": "\u4E3B\u83DC\u5355", class: "doc-navbutton doc-navbutton-navbar", onclick: "DOC.toggleNavbar()" }, this.renderIcon("menu")),
            jsx("a", { href: this.options.baseURL, class: "doc-logo" },
                new HTML(this.options.logo),
                jsx("span", { class: "doc-logo-title" }, this.options.displayName)),
            this.options.version ? jsx("div", { class: `doc-version${this.options.versions ? " doc-popup-trigger" : ""}` },
                this.options.version,
                this.options.versions ? this.renderIcon("chevron-down") : null,
                this.options.versions ? jsx("ul", { class: "doc-menu doc-popup doc-arrow" }, this.options.versions.map(version => jsx("li", null, this.renderLink(version.label, version.href, version.title)))) : null) : null,
            jsx("nav", { class: "doc-navbar" },
                jsx("ul", null, (_a = this.options.navbar) === null || _a === void 0 ? void 0 : _a.map(child => jsx("li", { class: child.href && url.startsWith(child.href) ? "doc-selected" : null },
                    this.renderLink(jsx(Fragment, null,
                        child.label,
                        child.children ? this.renderIcon("chevron-down", "doc-icon-space-left") : null), child.href, child.title),
                    child.children ? jsx("ul", { class: "doc-menu doc-popup" }, child.children.map(child => jsx("li", null, this.renderLink(child.label, child.href, child.title)))) : null)))),
            jsx("div", { class: "doc-search" },
                jsx("input", { type: "search", placeholder: "\u641C\u7D22(Shift+Alt+F)", autocomplete: "off", accesskey: "f", oninput: "DOC.showSearchResult(); DOC.updateSearchResult()", onfocus: "DOC.showSearchResult()", onkeydown: "DOC.handleSearchKeyDown(event)" }),
                this.renderIcon("search")),
            this.options.repository ? jsx("a", { href: this.options.repository, target: "_blank", class: "doc-external" }, this.renderIcon("github")) : null,
            jsx("button", { type: "button", "aria-label": "\u641C\u7D22", class: "doc-navbutton doc-navbutton-search", onclick: "DOC.toggleSearch()" }, this.renderIcon("search")),
            url ? jsx("button", { type: "button", "aria-label": "\u5217\u8868", class: "doc-navbutton doc-navbutton-sidebar", onclick: "DOC.toggleSidebar()" }, this.renderIcon("sidebar")) : null,
            jsx("div", { class: "doc-progress" }));
    }
    /**
     * 渲染底部
     * @param url 当前页面的地址
     */
    renderFooter(url) {
        return jsx("footer", { class: "doc-section doc-footer" },
            this.options.footer ? jsx("div", { class: "doc-links" }, this.options.footer.map((child, index) => jsx(Fragment, null,
                index ? " | " : null,
                this.renderLink(child.label, child.href, child.title)))) : null,
            this.options.copyright ? jsx("div", { class: "doc-copyright" }, this.options.copyright) : null);
    }
    /**
     * 渲染一个链接
     * @param label 链接的文案
     * @param href 链接的地址
     * @param title 鼠标悬停的工具提示
     * @param className 可选设置 CSS 类名
     */
    renderLink(label, href, title, className) {
        return jsx("a", { href: href && !isAbsoluteURL(href) && !/^\.\/|\.\.\/|#/.test(href) ? this.options.baseURL + href : href, target: isExternalURL(href) ? "_blank" : null, title: title, class: className }, label);
    }
    /**
     * 渲染一个图标
     * @param name 图标的名称
     * @param className 可选设置 CSS 类名
     */
    renderIcon(name, className) {
        const content = this.icons[name];
        if (content !== undefined) {
            return new HTML(content.replace(`<svg `, `<svg class="doc-icon${className ? " " + className : ""}" `));
        }
        return new HTML(`<svg class="doc-icon${className ? " " + className : ""}"><use xlink:href="${this.options.baseURL}tdk/assets/icons.svg#${name}"></use></svg>`);
    }
    /**
     * 渲染本节链接
     * @param anchor 当前链接的哈希值
     */
    renderPermalink(anchor) {
        return jsx("a", { href: "#" + anchor, class: "doc-permalink", title: "\u672C\u8282\u94FE\u63A5", "aria-hidden": "true" }, this.renderIcon("anchor"));
    }
    // #endregion
    // #region API 文档
    /**
     * 渲染指定文件的 API 文档
     * @param sourcePath JS/TS 文件路径
     * @param context 页面的上下文
     */
    renderAPIDoc(sourcePath, context) {
        // 生成 API 文档
        const sourceFile = this.builder.typeScriptCompiler.getSourceFile(sourcePath);
        if (!sourceFile) {
            return;
        }
        const program = this.builder.typeScriptCompiler.getCurrentProgram();
        const docParser = context.docParser = new TypeScriptDocParser(program);
        const docSourceFile = docParser.getDocSouceFile(sourceFile);
        if (!docSourceFile.members.length) {
            return;
        }
        // 添加目录
        const apiTOC = context.tocManager.add("API", 0);
        return jsx("section", { class: "doc-api-section", onclick: "DOC.handleMemberClick(event)" },
            jsx("h2", { id: apiTOC.anchor },
                this.renderPermalink(apiTOC.anchor),
                jsx("span", { class: "doc-toolbar" },
                    jsx("button", { class: "doc-toolbar-button doc-api-search" },
                        jsx("input", { type: "search", placeholder: "\u7B5B\u9009 API...", required: true, class: "doc-api-search-input", oninput: "DOC.handleMemberFilter(this)" }),
                        this.renderIcon("search"),
                        jsx("span", { class: "doc-tooltip doc-arrow" }, "\u7B5B\u9009 API")),
                    jsx("button", { class: "doc-toolbar-button doc-api-button-collapse", onclick: "DOC.toggleMembersCollapse(this)" },
                        this.renderIcon("sidebar"),
                        jsx("span", { class: "doc-tooltip doc-arrow" }, "\u5168\u90E8\u5C55\u5F00\u6216\u6298\u53E0"))),
                apiTOC.counter ? jsx("span", { class: "doc-counter" }, apiTOC.counter) : null,
                apiTOC.label),
            this.renderDocMembers(docSourceFile.members, 1, context));
    }
    /**
     * 渲染成员列表
     * @param members 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocMembers(members, tocLevel, context) {
        return members.map(member => {
            if (member.ignore) {
                return null;
            }
            return this.renderDocMember(member, tocLevel, context);
        });
    }
    /**
     * 渲染指定的成员
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocMember(member, tocLevel, context) {
        switch (member.memberType) {
            case 16 /* class */:
            case 16384 /* interface */:
                return this.renderDocClassOrInterface(member, tocLevel, context);
            case 8 /* function */:
            case 256 /* method */:
                return this.renderDocFunction(member, tocLevel, context);
            case 1 /* var */:
            case 2 /* let */:
            case 4 /* const */:
            case 32 /* field */:
            case 64 /* accessor */:
                return this.renderDocVariable(member, tocLevel, context);
            case 4096 /* enum */:
                return this.renderDocEnum(member, tocLevel, context);
            case 32768 /* typeAlias */:
                return this.renderDocTypeAlias(member, tocLevel, context);
            case 65536 /* namespace */:
                return this.renderDocNamespace(member, tocLevel, context);
            case 131072 /* module */:
                return this.renderDocModule(member, tocLevel, context);
            default:
                return this.renderDocUnknownMember(member, tocLevel, context);
        }
    }
    /**
     * 渲染一个类或接口
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocClassOrInterface(member, tocLevel, context) {
        var _a, _b;
        // 对每个成员按所属类型和成员类型进行分组
        let constructor;
        const thisProperties = [];
        const thisEvents = [];
        const thisMethods = [];
        const baseProperties = new Map();
        const baseEvents = new Map();
        const baseMethods = new Map();
        const preferRequested = member.members.every(member => member.memberType & (128 /* constructor */ | 2048 /* call */ | 1024 /* index */) || member.modifiers & 128 /* optional */);
        for (const child of member.members) {
            if (child.memberType === 128 /* constructor */) {
                constructor = child;
                continue;
            }
            if (child.modifiers & 8 /* private */) {
                continue;
            }
            let parentMember = child.parentMember;
            // 如果覆盖了基类同名成员，显示在基类的成员下
            let overridingMember = child.overridingMember;
            if (overridingMember) {
                while (overridingMember.overridingMember) {
                    overridingMember = overridingMember.parentMember;
                }
                parentMember = overridingMember.parentMember;
            }
            if (parentMember && parentMember !== member && (parentMember.memberType === 16 /* class */ || parentMember.memberType === 16384 /* interface */)) {
                if (child.memberType === 256 /* method */ || child.memberType === 2048 /* call */) {
                    const exists = baseMethods.get(parentMember);
                    if (exists) {
                        exists.push(child);
                    }
                    else {
                        baseMethods.set(parentMember, [child]);
                    }
                }
                else if (child.memberType === 32 /* field */ || child.memberType === 64 /* accessor */) {
                    const exists = baseProperties.get(parentMember);
                    if (exists) {
                        exists.push(child);
                    }
                    else {
                        baseProperties.set(parentMember, [child]);
                    }
                }
                else if (child.memberType === 512 /* event */) {
                    const exists = baseEvents.get(parentMember);
                    if (exists) {
                        exists.push(child);
                    }
                    else {
                        baseEvents.set(parentMember, [child]);
                    }
                }
            }
            else {
                if (child.memberType === 256 /* method */ || child.memberType === 2048 /* call */) {
                    thisMethods.push(child);
                }
                else if (child.memberType === 32 /* field */ || child.memberType === 64 /* accessor */ || child.memberType === 1024 /* index */) {
                    thisProperties.push(child);
                }
                else if (child.memberType === 512 /* event */) {
                    thisEvents.push(child);
                }
            }
        }
        const childTOCLevel = tocLevel < 0 ? -1 : tocLevel + 1;
        const showConstructor = constructor && (constructor.parameters.length || constructor.modifiers & (16 /* protected */ | 32 /* internal */ | 8 /* private */));
        return jsx("section", { class: "doc-api" },
            this.renderDocMemberHeader(member, member.memberType === 16 /* class */ ? "class" : "interface", member.memberType === 16 /* class */ ? " 类" : " 接口", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                ((_a = member.extends) === null || _a === void 0 ? void 0 : _a.length) ? jsx("div", { class: "doc-api-type" },
                    jsx("strong", null, "\u7EE7\u627F\uFF1A"),
                    member.extends.map((extend, index) => jsx(Fragment, null,
                        index ? "、" : null,
                        this.renderExtendingHierarchy(extend, context)))) : null,
                ((_b = member.implements) === null || _b === void 0 ? void 0 : _b.length) ? jsx("div", { class: "doc-api-type" },
                    jsx("span", { class: "doc-tag" }, "\u5B9E\u73B0"),
                    member.implements.map((extend, index) => jsx(Fragment, null,
                        index ? "、" : null,
                        this.renderDocType(extend, context)))) : null,
                this.renderDocTypeParameterList(member.typeParameters, context),
                showConstructor ? jsx("h4", null, "\u6784\u9020\u51FD\u6570") : null,
                showConstructor ? this.renderDocConstructor(constructor, member, childTOCLevel, context) : null,
                thisProperties.length || baseProperties.size ? jsx("h4", null, "\u5C5E\u6027") : null,
                thisProperties.length ? jsx("figure", null,
                    jsx("table", { class: "doc-api-table doc-api-props" },
                        jsx("tr", null,
                            jsx("th", { class: "doc-api-table-name" }, "\u5C5E\u6027\u540D"),
                            jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                            jsx("th", { class: "doc-api-table-type" }, "\u7C7B\u578B")),
                        thisProperties.map(property => property.memberType === 1024 /* index */ ? this.renderDocIndex(property, tocLevel, context) : this.renderDocProperty(property, preferRequested, childTOCLevel, context)))) : null,
                map(baseProperties, (key, value) => jsx("details", { class: "doc-api-inherited" },
                    jsx("summary", null,
                        "\u7EE7\u627F\u81EA ",
                        key.name,
                        " ",
                        key.memberType === 16 /* class */ ? "类" : "接口",
                        "\u7684\u5C5E\u6027"),
                    jsx("figure", null,
                        jsx("table", { class: "doc-api-table doc-api-props" },
                            jsx("tr", null,
                                jsx("th", { class: "doc-api-table-name" }, "\u5C5E\u6027\u540D"),
                                jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                                jsx("th", { class: "doc-api-table-type" }, "\u7C7B\u578B")),
                            value.map(property => property.memberType === 1024 /* index */ ? this.renderDocIndex(property, tocLevel, context) : this.renderDocProperty(property, preferRequested, childTOCLevel, context)))))),
                thisEvents.length || baseEvents.size ? jsx("h4", null, "\u4E8B\u4EF6") : null,
                thisEvents.length ? jsx("figure", null,
                    jsx("table", { class: "doc-api-table doc-api-props" },
                        jsx("tr", null,
                            jsx("th", { class: "doc-api-table-name" }, "\u4E8B\u4EF6\u540D"),
                            jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                            jsx("th", { class: "doc-api-table-type" }, "\u7C7B\u578B")),
                        thisEvents.map(property => this.renderDocProperty(property, true, childTOCLevel, context)))) : null,
                map(baseEvents, (key, value) => jsx("details", { class: "doc-api-inherited" },
                    jsx("summary", null,
                        "\u7EE7\u627F\u81EA ",
                        key.name,
                        " ",
                        key.memberType === 16 /* class */ ? "类" : "接口",
                        "\u7684\u4E8B\u4EF6"),
                    jsx("figure", null,
                        jsx("table", { class: "doc-api-table doc-api-props" },
                            jsx("tr", null,
                                jsx("th", { class: "doc-api-table-name" }, "\u4E8B\u4EF6\u540D"),
                                jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                                jsx("th", { class: "doc-api-table-type" }, "\u7C7B\u578B")),
                            value.map(property => this.renderDocProperty(property, true, childTOCLevel, context)))))),
                thisMethods.length || baseMethods.size ? jsx("h4", null, "\u65B9\u6CD5") : null,
                thisMethods.map(method => this.renderDocFunction(method, childTOCLevel, context)),
                map(baseMethods, (key, value) => jsx("details", { class: "doc-api-inherited" },
                    jsx("summary", null,
                        "\u7EE7\u627F\u81EA ",
                        key.name,
                        " ",
                        key.memberType === 16 /* class */ ? "类" : "接口",
                        "\u7684\u65B9\u6CD5"),
                    value.map(method => this.renderDocFunction(method, childTOCLevel, context))))));
        function map(map, callback) {
            const result = [];
            for (const [key, value] of map) {
                result.push(callback(key, value));
            }
            return result;
        }
    }
    /**
     * 渲染一个继承链
     * @param type 基础类型
     * @param context 页面的上下文
     */
    renderExtendingHierarchy(type, context) {
        var _a;
        const baseType = type.typeType === 64 /* class */ && ((_a = type.member.extends) === null || _a === void 0 ? void 0 : _a.find(t => t.typeType === 64 /* class */));
        return jsx(Fragment, null,
            this.renderDocType(type, context),
            baseType ? jsx(Fragment, null,
                " \u2190 ",
                this.renderExtendingHierarchy(baseType, context)) : null);
    }
    /**
     * 渲染一个索引访问器
     * @param member 要渲染的成员
     * @param parentMember 所属的类
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocConstructor(member, parentMember, tocLevel, context) {
        return jsx("section", { class: "doc-api doc-collapsed" },
            jsx("div", { class: "doc-api-header" },
                jsx("h4", { id: member.id, class: "doc-api-title" },
                    this.renderDocMemberToolBar(member, context),
                    this.renderPermalink(member.id),
                    jsx("code", { class: "doc-api-name" },
                        jsx("span", { class: "doc-tag-operator" }, "new "),
                        parentMember.name),
                    this.renderDocMemberTags(member, false, context)),
                member.summary ? this.renderDocMemberSummary(member, context) : jsx("div", { class: "doc-api-summary" },
                    "\u521D\u59CB\u5316\u65B0\u7684 ",
                    this.renderDocMemberLink(parentMember, context),
                    " \u5B9E\u4F8B",
                    this.renderDocDeprecatedMessage(member, context))),
            jsx("div", { class: "doc-api-body" }, this.renderDocFunctionBody(member, tocLevel, context)));
    }
    /**
     * 渲染一个属性
     * @param member 要渲染的成员
     * @param preferRequested 是否标记必填项而非可选项
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocProperty(member, preferRequested, tocLevel, context) {
        const tocItem = tocLevel >= 0 ? context.tocManager.add(member.name, tocLevel, member.id, "") : null;
        this.addSearchKeyword(context.sourceURL, member.name);
        return jsx("tr", { id: tocItem === null || tocItem === void 0 ? void 0 : tocItem.anchor },
            jsx("td", { class: "doc-api-table-name" },
                this.renderIcon(member.memberType === 64 /* accessor */ ? "property" : member.memberType === 512 /* event */ ? "event" : "field", "doc-icon-space-right"),
                this.renderDocMemberName(member, null, context),
                this.renderDocMemberTags(member, preferRequested, context)),
            jsx("td", { class: "doc-api-table-summary" },
                this.renderDocMarkdown(member.summary, context),
                this.renderDocDeprecatedMessage(member, context),
                this.renderDocTypeDetail(member.type, context),
                this.renderDocMemberDetail(member, context)),
            jsx("td", { class: "doc-api-table-type" }, this.renderDocType(member.type, context)));
    }
    /**
     * 渲染类型的子属性
     * @param type 要渲染的类型
     * @param context 页面的上下文
     */
    renderDocTypeDetail(type, context) {
        const detail = this.renderDocObjectType(type, context, 0, new Set());
        if (detail) {
            return jsx("details", null,
                jsx("summary", null, "\u5C55\u5F00\u5B50\u5C5E\u6027"),
                detail);
        }
        return null;
    }
    /**
     * 渲染一个索引访问器
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocIndex(member, tocLevel, context) {
        return jsx("tr", { id: member.id },
            jsx("td", { class: "doc-api-table-name" },
                this.renderIcon("var", "doc-icon-space-right"),
                jsx("code", null,
                    "[",
                    member.parameters[0].name,
                    ": ",
                    this.renderDocType(member.parameters[0].type, context),
                    "]")),
            jsx("td", { class: "doc-api-table-summary" },
                this.renderDocMarkdown(member.summary, context),
                this.renderDocDeprecatedMessage(member, context),
                this.renderDocMemberDetail(member, context)),
            jsx("td", { class: "doc-api-table-type" }, this.renderDocType(member.returnType, context)));
    }
    /**
     * 渲染一个枚举类型
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocEnum(member, tocLevel, context) {
        return jsx("section", { class: "doc-api doc-collapsed" },
            this.renderDocMemberHeader(member, "enum", " 枚举", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                jsx("h4", null, "\u6210\u5458"),
                jsx("figure", null,
                    jsx("table", { class: "doc-api-table doc-api-enummembers" },
                        jsx("tr", null,
                            jsx("th", { class: "doc-api-table-name" }, "\u679A\u4E3E\u540D"),
                            jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                            jsx("th", { class: "doc-api-table-type" }, "\u503C")),
                        member.members.map(child => jsx("tr", { id: child.id },
                            jsx("td", { class: "doc-api-table-name" },
                                this.renderIcon(child.memberType === 8192 /* enumMember */ ? "enummember" : "field", "doc-icon-space-right"),
                                this.renderDocMemberName(child, null, context),
                                this.renderDocMemberTags(child, false, context)),
                            jsx("td", { class: "doc-api-table-summary" },
                                this.renderDocMarkdown(child.summary, context),
                                this.renderDocMemberDetail(child, context)),
                            jsx("td", { class: "doc-api-table-type" }, child.defaultValue !== undefined ? this.renderDocExpression(child.defaultValue, context) : null))))),
                this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染一个命名空间
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocNamespace(member, tocLevel, context) {
        return jsx("section", { class: "doc-api" },
            this.renderDocMemberHeader(member, "namespace", " 命名空间", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                this.renderDocMembers(member.members, tocLevel < 0 ? -1 : tocLevel + 1, context),
                this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染一个包
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocModule(member, tocLevel, context) {
        return jsx("section", { class: "doc-api" },
            this.renderDocMemberHeader(member, "package", " 包", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                this.renderDocMembers(member.members, tocLevel < 0 ? -1 : tocLevel + 1, context),
                this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染一个类型别名
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocTypeAlias(member, tocLevel, context) {
        return jsx("section", { class: "doc-api doc-collapsed" },
            this.renderDocMemberHeader(member, "interface", " 类型", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                jsx("div", { class: "doc-api-type" },
                    jsx("strong", null, "\u540C\uFF1A"),
                    this.renderDocType(member.aliasedType, context)),
                this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染一个变量
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocVariable(member, tocLevel, context) {
        return jsx("section", { class: "doc-api doc-collapsed" },
            this.renderDocMemberHeader(member, member.memberType === 4 /* const */ ? "const" : "var", "", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                jsx("div", { class: "doc-api-type" },
                    jsx("strong", null, "\u7C7B\u578B\uFF1A"),
                    this.renderDocType(member.type, context)),
                this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染一个函数或方法
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocFunction(member, tocLevel, context) {
        const namespaceMembers = member.namespace ? this.renderDocMembers(member.namespace.members, -1, context) : null;
        return jsx("section", { class: "doc-api doc-collapsed" },
            this.renderDocMemberHeader(member, "method", "", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" },
                this.renderDocFunctionBody(member, tocLevel, context),
                member.namespace ? jsx(Fragment, null,
                    namespaceMembers ? jsx("h5", null, "\u6210\u5458") : null,
                    namespaceMembers,
                    this.renderDocMemberDetail(member.namespace, context)) : null,
                member.classOrInterface ? this.renderDocClassOrInterface(member.classOrInterface, -1, context) : null));
    }
    /**
     * 渲染一个函数或方法主体
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocFunctionBody(member, tocLevel, context) {
        if (member.overloads) {
            return jsx("div", { class: "doc-tab" },
                jsx("div", { class: "doc-tab-header" },
                    jsx("ul", { onclick: "DOC.toggleTab(event.target)", role: "tablist" }, member.overloads.map((overload, index) => jsx("li", { tabindex: "0", role: "tab", class: index === 0 ? "doc-selected" : "" },
                        "\u91CD\u8F7D ",
                        index + 1)))),
                jsx("div", { class: "doc-tab-body" }, member.overloads.map((overload, index) => jsx("div", { class: `doc-tab-content${index === 0 ? " doc-selected" : ""}`, role: "tabpanel" },
                    this.renderDocMarkdown(overload.summary, context),
                    this.renderDocDeprecatedMessage(overload, context),
                    this.renderDocFunctionBody(overload, tocLevel, context)))));
        }
        return jsx(Fragment, null,
            this.renderDocTypeParameterList(member.typeParameters, context),
            this.renderDocParameterList(member.parameters, context),
            member.memberType !== 128 /* constructor */ ? jsx("h5", null, "\u8FD4\u56DE\u503C") : null,
            member.memberType !== 128 /* constructor */ ? jsx("div", { class: "doc-api-type" },
                jsx("strong", null, "\u7C7B\u578B\uFF1A"),
                this.renderDocType(member.returnType, context)) : null,
            member.returnSummary ? this.renderDocMarkdown(member.returnSummary, context) : null,
            this.renderDocMemberDetail(member, context));
    }
    /**
     * 渲染类型参数列表
     * @param typeParameters 类型列表
     * @param context 页面的上下文
     */
    renderDocTypeParameterList(typeParameters, context) {
        return (typeParameters === null || typeParameters === void 0 ? void 0 : typeParameters.length) ? jsx(Fragment, null,
            jsx("h5", null, "\u6CDB\u578B\u53C2\u6570"),
            jsx("ul", null, typeParameters.map(parameter => jsx("li", null,
                jsx("code", null, parameter.name),
                parameter.constraintType ? jsx(Fragment, null,
                    ": ",
                    this.renderDocType(parameter.constraintType, context)) : null,
                parameter.defaultType ? jsx(Fragment, null,
                    " = ",
                    this.renderDocType(parameter.defaultType, context)) : null,
                parameter.summary ? jsx(Fragment, null,
                    " \u2014 ",
                    this.renderDocMarkdown(parameter.summary, context)) : null)))) : null;
    }
    /**
     * 渲染参数列表
     * @param tparameters 类型列表
     * @param context 页面的上下文
     */
    renderDocParameterList(parameters, context) {
        return parameters.length ? jsx(Fragment, null,
            jsx("h5", null, "\u53C2\u6570"),
            jsx("figure", null,
                jsx("table", { class: "doc-api-table" },
                    jsx("tr", null,
                        jsx("th", { class: "doc-api-table-name" }, "\u53C2\u6570\u540D"),
                        jsx("th", { class: "doc-api-table-summary" }, "\u8BF4\u660E"),
                        jsx("th", { class: "doc-api-table-type" }, "\u7C7B\u578B")),
                    parameters.map(parameter => jsx("tr", null,
                        jsx("td", { class: "doc-api-table-name" },
                            parameter.optional ? jsx("small", { class: "doc-api-optional" }, "(\u53EF\u9009)") : null,
                            parameter.rest ? jsx("code", null, "...") : null,
                            jsx("code", null, parameter.name)),
                        jsx("td", { class: "doc-api-table-summary" },
                            this.renderDocMarkdown(parameter.summary, context),
                            parameter.subParameters ? jsx("ul", null, parameter.subParameters.map(subParameter => jsx("li", null,
                                subParameter.name === "return" ? "返回值" : jsx("code", null, subParameter.name),
                                subParameter.optional ? jsx("small", { class: "doc-api-optional" }, "(\u53EF\u9009)") : null,
                                subParameter.summary ? new HTML(" — " + this.markdownCompiler.renderInline(subParameter.summary, context)) : null))) : null,
                            this.renderDocTypeDetail(parameter.type, context),
                            parameter.defaultValue !== undefined ? jsx("p", null,
                                jsx("strong", null, "\u9ED8\u8BA4\u503C\uFF1A"),
                                this.renderDocExpression(parameter.defaultValue, context)) : null),
                        jsx("td", { class: "doc-api-table-type" }, this.renderDocType(parameter.type, context))))))) : null;
    }
    /**
     * 渲染一个未知成员
     * @param member 要渲染的成员
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocUnknownMember(member, tocLevel, context) {
        return jsx("section", { class: "doc-api" },
            this.renderDocMemberHeader(member, "snippet", "", false, tocLevel, context),
            jsx("div", { class: "doc-api-body" }, this.renderDocMemberDetail(member, context)));
    }
    /**
     * 渲染成员头部
     * @param member 要渲染的成员
     * @param icon 渲染的图标
     * @param postfix 额外显示的后缀
     * @param preferRequested 是否标记必填项而非可选项
     * @param tocLevel 添加到目录的等级，如果为 -1 则不添加目录
     * @param context 页面的上下文
     */
    renderDocMemberHeader(member, icon, postfix, preferRequested, tocLevel, context) {
        const tocItem = tocLevel >= 0 ? context.tocManager.add(member.name + postfix, tocLevel, member.id, "") : null;
        this.addSearchKeyword(context.sourceURL, member.name);
        return jsx("div", { class: "doc-api-header" },
            jsx("h4", { id: tocItem === null || tocItem === void 0 ? void 0 : tocItem.anchor, class: "doc-api-title" },
                this.renderDocMemberToolBar(member, context),
                tocItem ? this.renderPermalink(tocItem.anchor) : null,
                this.renderIcon(icon, "doc-icon-space-right"),
                this.renderDocMemberName(member, postfix, context),
                this.renderDocMemberTags(member, preferRequested, context)),
            this.renderDocMemberSummary(member, context));
    }
    /**
     * 渲染一个工具条
     * @param member 要渲染的成员
     * @param context 页面的上下文
     */
    renderDocMemberToolBar(member, context) {
        var _a;
        const parent = member.parentMember && member.parentMember.memberType !== 0 /* unknown */ ? this.renderDocMemberLink(member.parentMember, context, (_a = member.overridingMember) !== null && _a !== void 0 ? _a : member.baseMember) : null;
        const sourceLocation = member.sourceLocation;
        const sourceHref = sourceLocation ? this.getSourceURL(sourceLocation) : undefined;
        const source = sourceHref ? jsx("a", { href: sourceHref, class: "doc-toolbar-button", "aria-label": "\u67E5\u770B\u6E90\u7801" },
            this.renderIcon("code"),
            jsx("span", { class: "doc-tooltip doc-arrow" },
                "\u67E5\u770B\u6E90\u7801",
                jsx("br", null),
                jsx("small", null,
                    "(\u5171 ",
                    sourceLocation.endLine - sourceLocation.line + 1,
                    " \u884C)"))) : null;
        return parent || source ? jsx("span", { class: "doc-toolbar" },
            parent,
            source) : null;
    }
    /**
     * 获取指定源码地址的链接
     * @param sourceLocation 源码地址
     */
    getSourceURL(sourceLocation) {
        if (this.builder.isIgnored(sourceLocation.sourcePath) || !this.options.repository) {
            return;
        }
        return `${this.options.repository}/blob/${this.options.branch}/${this.options.repositoryPath}${this.builder.toURL(sourceLocation.sourcePath)}#L${sourceLocation.line + 1}-${sourceLocation.endLine + 1}`;
    }
    /**
     * 渲染一个指定成员的链接
     * @param member 要渲染的成员
     * @param context 页面的上下文
     * @param anchorMember 附加设置描点的成员
     */
    renderDocMemberLink(member, context, anchorMember = member) {
        const url = anchorMember.sourceLocation ? this.getDocURL(anchorMember.sourceLocation) : undefined;
        if (!url) {
            return jsx("code", { class: "doc-token-class-name" }, member.name);
        }
        return jsx("code", null,
            jsx("a", { href: (url === context.url ? "" : this.options.baseURL + url) + "#" + anchorMember.id, class: "doc-token-class-name" }, member.name));
    }
    /**
     * 获取指定成员文档的链接
     * @param sourceLocation 源码地址
     */
    getDocURL(sourceLocation) {
        if (this.builder.isIgnored(sourceLocation.sourcePath)) {
            return;
        }
        return this.builder.toShortURL(this.builder.getHTMLOutputName(sourceLocation.sourcePath));
    }
    /**
     * 渲染一个成员名
     * @param member 要渲染的成员
     * @param postfix 额外显示的后缀
     * @param context 页面的上下文
     */
    renderDocMemberName(member, postfix, context) {
        return jsx("code", { class: "doc-api-name" },
            member.modifiers & 64 /* static */ && member.parentMember ? member.parentMember.name + "." : null,
            member.name,
            postfix);
    }
    /**
     * 渲染成员的标签
     * @param member 要渲染的成员
     * @param preferRequested 是否标记必填项而非可选项
     * @param context 页面的上下文
     */
    renderDocMemberTags(member, preferRequested, context) {
        return jsx(Fragment, null,
            member.modifiers & 128 /* optional */ ? preferRequested ? null : jsx("small", { class: "doc-api-optional" }, "(\u53EF\u9009)") : preferRequested ? jsx("small", { class: "doc-api-optional" }, "(\u5FC5\u586B)") : null,
            member.modifiers & 8192 /* async */ ? jsx("span", { class: "doc-tag" }, "\u5F02\u6B65") : null,
            member.modifiers & 4096 /* generator */ ? jsx("span", { class: "doc-tag" }, "\u751F\u6210\u5668") : null,
            member.modifiers & 2 /* exportDefault */ ? jsx("span", { class: "doc-tag doc-success" }, "\u9ED8\u8BA4\u5BFC\u51FA") : null,
            member.modifiers & 16 /* protected */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u4FDD\u62A4") : null,
            member.modifiers & 8 /* private */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u79C1\u6709") : null,
            member.modifiers & 32 /* internal */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u5185\u90E8") : null,
            member.modifiers & 64 /* static */ ? jsx("span", { class: "doc-tag doc-info" }, "\u9759\u6001") : null,
            member.modifiers & 256 /* readOnly */ ? jsx("span", { class: "doc-tag doc-info" }, "\u53EA\u8BFB") : null,
            member.modifiers & 2048 /* final */ ? jsx("span", { class: "doc-tag doc-info" }, "\u5BC6\u5C01") : null,
            member.modifiers & 512 /* virtual */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u53EF\u91CD\u5199") : null,
            member.modifiers & 1024 /* abstract */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u62BD\u8C61") : null,
            member.overridingMember ? jsx("span", { class: "doc-tag" }, "\u5DF2\u91CD\u5199") : null,
            member.modifiers & 16384 /* deprecated */ ? jsx("span", { class: "doc-tag doc-error" }, "\u5DF2\u5E9F\u5F03") : null,
            member.modifiers & 32768 /* experimental */ ? jsx("span", { class: "doc-tag doc-warning" }, "\u8BD5\u9A8C\u4E2D") : null);
    }
    /**
     * 渲染成员的概述
     * @param member 要渲染的成员
     * @param context 页面的上下文
     */
    renderDocMemberSummary(member, context) {
        return member.summary ? jsx("div", { class: "doc-api-summary" },
            this.renderDocMarkdown(member.summary, context),
            this.renderDocDeprecatedMessage(member, context)) : null;
    }
    /**
     * 渲染已废弃提示
     * @param member 要渲染的成员
     * @param context 页面的上下文
     */
    renderDocDeprecatedMessage(member, context) {
        return member.deprecatedMessage ? jsx("blockquote", { class: "doc-blockquote doc-warning" },
            jsx("div", { class: "doc-blockquote-title" },
                this.renderIcon("warning", "doc-blockquote-icon"),
                "\u5DF2\u5E9F\u5F03"),
            member.deprecatedMessage) : null;
    }
    /**
     * 渲染成员的详情描述
     * @param member 要渲染的成员
     * @param context 页面的上下文
     */
    renderDocMemberDetail(member, context) {
        var _a, _b;
        return jsx(Fragment, null,
            member.since ? jsx("div", { class: "doc-api-type" },
                jsx("strong", null, "\u65B0\u589E\u4E8E\uFF1A"),
                member.since) : null,
            member.description ? jsx(Fragment, null,
                jsx("h5", null, "\u8BF4\u660E"),
                this.renderDocMarkdown(member.description, context)) : null,
            ((_a = member.examples) === null || _a === void 0 ? void 0 : _a.length) ? jsx(Fragment, null,
                jsx("h5", null, "\u793A\u4F8B"),
                member.examples.map(example => this.renderDocExample(example, context))) : null,
            ((_b = member.seeAlso) === null || _b === void 0 ? void 0 : _b.length) ? jsx(Fragment, null,
                jsx("h5", null, "\u53E6\u53C2\u8003"),
                jsx("ul", null, member.seeAlso.map(seeAlso => jsx("li", null, this.renderDocSeeAlso(seeAlso, context))))) : null);
    }
    /**
     * 渲染一个示例
     * @param example 示例的内容
     * @param context 页面的上下文
     */
    renderDocExample(example, context) {
        // 多行的示例可能是 Markdown
        const lineBreakIndex = example.indexOf("\n");
        if (lineBreakIndex >= 0 && /^##|^```|^:::/m.test(example)) {
            return this.renderDocMarkdown(example, context);
        }
        return jsx(Fragment, null,
            lineBreakIndex > 0 ? jsx("h5", null, this.markdownCompiler.renderInline(example.substring(0, lineBreakIndex), context)) : null,
            jsx("pre", { class: "doc-code doc-code-merge" },
                jsx("span", { class: "doc-toolbar" },
                    jsx("button", { type: "button", "aria-hidden": "true", class: "doc-toolbar-button doc-code-tool-copy", onclick: "DOC.handleCopy(this, '\u5DF2\u590D\u5236', '\u590D\u5236\u5931\u8D25')" },
                        this.renderIcon("copy"),
                        jsx("span", { class: "doc-tooltip doc-arrow" }, "\u590D\u5236\u6E90\u7801"))),
                jsx("code", { class: `doc-language-tsx` }, new HTML(highlight(example.substring(lineBreakIndex + 1), "tsx", "doc-token-")))));
    }
    /**
     * 渲染一个参考链接
     * @param seeAlso 链接的内容
     * @param context 页面的上下文
     */
    renderDocSeeAlso(seeAlso, context) {
        const parsed = this.parseHref(seeAlso, context);
        return this.renderLink(parsed.label, parsed.href);
    }
    /**
     * 解析一个链接地址
     * @param href 要解析的地址
     * @param context 页面的上下文
     */
    parseHref(href, context) {
        var _a, _b, _c;
        if (isAbsoluteURL(href)) {
            return { href: href, label: href };
        }
        if (href.startsWith("#")) {
            const content = href.substring(1);
            return { href: "#" + ((_a = context.tocManager.findAnchor(content)) !== null && _a !== void 0 ? _a : content), label: content };
        }
        const queryOrHashIndex = href.search(/[?#]/);
        const queryOrHash = queryOrHashIndex >= 0 ? href.substring(queryOrHashIndex) : "";
        if (queryOrHashIndex > 0) {
            href = href.substring(0, queryOrHashIndex);
        }
        // 链接到 API 文档
        if (/\.[jt]sx?$/i.test(href)) {
            return {
                href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
                label: (_c = (_b = /#(.*)$/.exec(queryOrHash)) === null || _b === void 0 ? void 0 : _b[1]) !== null && _c !== void 0 ? _c : setExt(relativePath(this.builder.options.srcDir, href), "")
            };
        }
        // 链接到其它 Markdown 文档
        if (/\.md$/i.test(href)) {
            // 读取 Markdown 标记
            const path = resolvePath(this.builder.options.baseDir, context.url, "..", href);
            context.dependencies.push(path);
            let label;
            try {
                const markdownContent = readFileSync(path, "utf-8");
                label = this.parseMarkdownMeta(markdownContent, path).title;
            }
            catch (_d) {
                label = this.parseMarkdownMeta("", path).title;
            }
            return {
                href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
                label: label
            };
        }
        return {
            href: this.builder.getHTMLOutputName(joinPath(context.url, "..", href)) + queryOrHash,
            label: href
        };
    }
    /**
     * 渲染一个类型
     * @param type 要渲染的类型
     * @param context 页面的上下文
     */
    renderDocType(type, context) {
        return jsx("code", null, this.renderDocTypeWorker(type, context, 0, new Set()));
    }
    /**
     * 渲染类型
     * @param type 要渲染的类型
     * @param context 页面的上下文
     * @param depth 遍历的深度
     * @param rendered 已渲染的类型
     */
    renderDocTypeWorker(type, context, depth, rendered) {
        if (rendered.has(type)) {
            return jsx("span", { class: "doc-more", onclick: "DOC.showMoreDetails(this)" },
                "(Circular)",
                jsx("span", { class: "doc-more-details" }, context.docParser.typeToString(type)));
        }
        rendered.add(type);
        try {
            switch (type.typeType) {
                case 2 /* native */:
                    return jsx("span", { class: "doc-token-builtin" }, type.name);
                case 1 /* error */:
                    return jsx("span", { class: "doc-token-entity" }, "?");
                case 64 /* class */:
                case 128 /* interface */:
                case 256 /* enum */:
                    return this.renderDocMemberLink(type.member, context);
                case 4 /* numberLiteral */:
                case 16 /* bigintLiteral */:
                    return jsx("span", { class: "doc-token-number" }, type.value);
                case 8 /* stringLiteral */:
                    return jsx("span", { class: "doc-token-string" }, JSON.stringify(type.value));
                case 131072 /* array */:
                    return jsx(Fragment, null,
                        type.element.typeType & (16384 /* function */ | 4194304 /* union */ | 8388608 /* intersection */ | 16777216 /* conditional */) ? jsx(Fragment, null,
                            jsx("span", { class: "doc-token-punctuation" }, "("),
                            this.renderDocTypeWorker(type.element, context, depth + 1, rendered),
                            jsx("span", { class: "doc-token-punctuation" }, ")")) : this.renderDocTypeWorker(type.element, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, "[]"));
                case 16384 /* function */:
                    const func = jsx(Fragment, null,
                        type.typeParameters ? jsx(Fragment, null,
                            jsx("span", { class: "doc-token-punctuation" }, "<"),
                            type.typeParameters.map((typeParameter, index) => jsx(Fragment, null,
                                index ? jsx("span", { class: "doc-token-punctuation" }, ", ") : null,
                                jsx("span", { class: "doc-token-class-name" }, typeParameter.name),
                                typeParameter.constraintType ? jsx(Fragment, null,
                                    jsx("span", { class: "doc-token-keyword" }, ": "),
                                    this.renderDocTypeWorker(typeParameter.constraintType, context, depth + 1, rendered)) : null,
                                typeParameter.defaultType ? jsx(Fragment, null,
                                    jsx("span", { class: "doc-token-operator" }, " = "),
                                    this.renderDocTypeWorker(typeParameter.defaultType, context, depth + 1, rendered)) : null)),
                            jsx("span", { class: "doc-token-punctuation" }, ">")) : null,
                        this.renderDocParameters(type.parameters, context, depth, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, " => "),
                        this.renderDocTypeWorker(type.returnType, context, depth + 1, rendered));
                    if (depth && func.length > 20) {
                        return jsx("span", { class: "doc-more", onclick: "DOC.showMoreDetails(this)" },
                            jsx("span", { class: "doc-token-builtin" }, "function"),
                            jsx("span", { class: "doc-more-details" }, func));
                    }
                    return func;
                case 32768 /* constructor */:
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-operator" }, "new"),
                        this.renderDocParameters(type.parameters, context, depth, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, " => "),
                        this.renderDocTypeWorker(type.returnType, context, depth + 1, rendered));
                case 4096 /* this */:
                    return jsx("span", { class: "doc-token-builtin", title: type.member.name }, "this");
                case 2048 /* typeParameter */:
                    return jsx("span", { class: "doc-token-class-name" }, type.member.name);
                case 4194304 /* union */:
                case 8388608 /* intersection */:
                    const list = type.operands.map(item => {
                        const element = this.renderDocTypeWorker(item, context, depth + 1, rendered);
                        if (item.typeType === 16384 /* function */ || item.typeType === 32768 /* constructor */) {
                            return jsx(Fragment, null,
                                "(",
                                element,
                                ")");
                        }
                        return element;
                    });
                    // 属性超过 10 个时仅显示前 3 和后 2
                    if (list.length > 10) {
                        const deleted = list.splice(3, list.length - 6);
                        list[3] = jsx("span", { class: "doc-more", onclick: "DOC.showMoreDetails(this)" },
                            "... ",
                            deleted.length,
                            " more ...",
                            jsx("span", { class: "doc-more-details" }, deleted.map((item, index) => jsx(Fragment, null,
                                index ? jsx("span", { class: "doc-token-punctuation" },
                                    " ",
                                    type.typeType === 4194304 /* union */ ? "|" : "&",
                                    " ") : null,
                                item))));
                    }
                    return list.map((item, index) => jsx(Fragment, null,
                        index ? jsx("span", { class: "doc-token-punctuation" },
                            " ",
                            type.typeType === 4194304 /* union */ ? "|" : "&",
                            " ") : null,
                        item));
                case 524288 /* keyOf */:
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-operator" }, "keyof "),
                        type.target.typeType & (16384 /* function */ | 4194304 /* union */ | 8388608 /* intersection */ | 16777216 /* conditional */) ? jsx(Fragment, null,
                            jsx("span", { class: "doc-token-punctuation" }, "("),
                            this.renderDocTypeWorker(type.target, context, depth + 1, rendered),
                            jsx("span", { class: "doc-token-punctuation" }, ")")) : this.renderDocTypeWorker(type.target, context, depth + 1, rendered));
                case 262144 /* tuple */:
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-punctuation" }, "["),
                        type.elements.map((element, index) => jsx(Fragment, null,
                            index ? jsx("span", { class: "doc-token-punctuation" }, ", ") : null,
                            this.renderDocTypeWorker(element, context, depth + 1, rendered))),
                        jsx("span", { class: "doc-token-punctuation" }, "]"));
                case 8192 /* generic */:
                    return jsx(Fragment, null,
                        this.renderDocTypeWorker(type.target, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, "<"),
                        type.typeArguments.map((element, index) => jsx(Fragment, null,
                            index ? jsx("span", { class: "doc-token-punctuation" }, ", ") : null,
                            this.renderDocTypeWorker(element, context, depth + 1, rendered))),
                        jsx("span", { class: "doc-token-punctuation" }, ">"));
                case 1024 /* typeAlias */:
                    return this.renderDocMemberLink(type.member, context);
                case 16777216 /* conditional */:
                    return jsx(Fragment, null,
                        this.renderDocTypeWorker(type.checkType, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-operator" }, " extends "),
                        this.renderDocTypeWorker(type.extendsType, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, " ? "),
                        this.renderDocTypeWorker(type.trueType, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, " : "),
                        this.renderDocTypeWorker(type.falseType, context, depth + 1, rendered));
                case 512 /* enumMember */:
                    return jsx(Fragment, null,
                        this.renderDocMemberLink(type.member.parentMember, context),
                        jsx("span", { class: "doc-token-punctuation" }, "."),
                        this.renderDocMemberLink(type.member, context));
                case 1048576 /* typeOf */:
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-operator" }, "typeof "),
                        this.renderDocMemberLink(type.member, context));
                case 2097152 /* indexedAccess */:
                    return jsx(Fragment, null,
                        type.target.typeType & (16384 /* function */ | 4194304 /* union */ | 8388608 /* intersection */ | 16777216 /* conditional */) ? jsx(Fragment, null,
                            jsx("span", { class: "doc-token-punctuation" }, "("),
                            this.renderDocTypeWorker(type.target, context, depth + 1, rendered),
                            jsx("span", { class: "doc-token-punctuation" }, ")")) : this.renderDocTypeWorker(type.target, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, "["),
                        this.renderDocTypeWorker(type.key, context, depth + 1, rendered),
                        jsx("span", { class: "doc-token-punctuation" }, "]"));
                case 65536 /* object */:
                    const members = type.members.map((child, index) => jsx("span", { class: "doc-type-indent" },
                        child.memberType === 2048 /* call */ || child.memberType === 1024 /* index */ ? null : jsx("span", { class: "doc-token-property" },
                            child.memberType === 131072 /* module */ ? "..." : null,
                            child.name),
                        child.memberType === 32 /* field */ ? jsx(Fragment, null,
                            child.modifiers & 128 /* optional */ ? jsx("span", { class: "doc-token-operator" }, "?") : null,
                            jsx("span", { class: "doc-token-punctuation" }, ": "),
                            this.renderDocTypeWorker(child.type, context, depth + 1, rendered)) : child.memberType === 256 /* method */ || child.memberType === 2048 /* call */ ? jsx(Fragment, null,
                            this.renderDocParameters(child.parameters, context, depth, rendered),
                            jsx("span", { class: "doc-token-punctuation" }, ": "),
                            this.renderDocTypeWorker(child.returnType, context, depth + 1, rendered)) : child.memberType === 1024 /* index */ ? jsx(Fragment, null,
                            jsx("span", { class: "doc-token-punctuation" }, "["),
                            child.parameters[0].name,
                            jsx("span", { class: "doc-token-punctuation" }, ": "),
                            this.renderDocTypeWorker(child.parameters[0].type, context, depth + 1, rendered),
                            jsx("span", { class: "doc-token-punctuation" }, "]"),
                            jsx("span", { class: "doc-token-punctuation" }, ": "),
                            this.renderDocTypeWorker(child.returnType, context, depth + 1, rendered)) : null,
                        child.summary ? jsx("span", { class: "doc-token-comment" },
                            " // ",
                            new HTML(this.markdownCompiler.renderInline(child.summary, context))) : null));
                    // 属性超过 10 个时仅显示前 3 和后 2
                    if (members.length > 10) {
                        const deleted = members.splice(3, members.length - 6);
                        members[3] = jsx("span", { class: "doc-more", onclick: "DOC.showMoreDetails(this)" },
                            "... ",
                            deleted.length,
                            " more ...",
                            jsx("span", { class: "doc-more-details" }, deleted));
                    }
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-punctuation" }, "{"),
                        members,
                        jsx("span", { class: "doc-token-punctuation" }, "}"));
                case 32 /* templateLiteral */:
                    return jsx(Fragment, null,
                        jsx("span", { class: "doc-token-string" }, "`"),
                        type.spans.map(span => typeof span === "string" ? jsx("span", { class: "doc-token-string" }, span.replace(/`/g, "\\`")) : jsx(Fragment, null,
                            jsx("span", { class: "doc-token-entity" }, "${"),
                            this.renderDocTypeWorker(span, context, depth + 1, rendered),
                            jsx("span", { class: "doc-token-entity" }, "}"))),
                        jsx("span", { class: "doc-token-string" }, "`"));
            }
            return context.docParser.typeToString(type);
        }
        finally {
            rendered.delete(type);
        }
    }
    /**
     * 渲染类型中的参数列表
     * @param expression 要渲染的表达式
     */
    renderDocParameters(parameters, context, depth, rendered) {
        return jsx(Fragment, null,
            jsx("span", { class: "doc-token-punctuation" }, "("),
            parameters.map((parameter, index) => jsx(Fragment, null,
                index ? jsx("span", { class: "doc-token-punctuation" }, ", ") : null,
                parameter.rest ? jsx("span", { class: "doc-token-punctuation" }, "...") : null,
                jsx("span", { class: "doc-token-variable" }, parameter.name),
                parameter.optional ? jsx("span", { class: "doc-token-operator" }, "?") : null,
                jsx("span", { class: "doc-token-punctuation" }, ": "),
                this.renderDocTypeWorker(parameter.type, context, depth + 1, rendered))),
            jsx("span", { class: "doc-token-punctuation" }, ")"));
    }
    /**
     * 渲染一个对象类型
     * @param type 要渲染的类型
     * @param context 页面的上下文
     * @param depth 遍历的深度
     * @param rendered 已渲染的类型
     */
    renderDocObjectType(type, context, depth, rendered) {
        if (depth > 5) {
            return null;
        }
        type = findObjectType(type, 0);
        if (!type) {
            return null;
        }
        if (rendered.has(type)) {
            return null;
        }
        const properties = context.docParser.getPropertiesOfType(type);
        if (!properties.length) {
            return null;
        }
        rendered.add(type);
        try {
            return jsx("ul", null, properties.map(property => {
                const type = context.docParser.checker.getTypeOfSymbolAtLocation(property.raw, property.declaration);
                const docType = context.docParser.getDocType(type);
                const childObject = this.renderDocObjectType(docType, context, depth + 1, rendered);
                const name = jsx("code", null, property.name);
                const summary = property.summary ? new HTML(" — " + this.markdownCompiler.renderInline(property.summary, context)) : null;
                if (childObject) {
                    return jsx("li", null,
                        name,
                        docType.typeType === 131072 /* array */ ? new HTML(`: <code class="doc-token-builtin">array</code>`) : "",
                        summary,
                        childObject);
                }
                return jsx("li", null,
                    name,
                    ": ",
                    jsx("code", null, this.renderDocTypeWorker(docType, context, depth, rendered)),
                    summary);
            }));
        }
        finally {
            rendered.delete(type);
        }
        function findObjectType(type, depth) {
            var _a;
            if (depth > 9) {
                return null;
            }
            switch (type.typeType) {
                case 65536 /* object */:
                case 0 /* unknown */:
                    return type;
                case 1024 /* typeAlias */:
                    return findObjectType(type.aliasedType, depth + 1);
                case 128 /* interface */:
                    if (!((_a = type.member.members) === null || _a === void 0 ? void 0 : _a.some(member => member.memberType === 256 /* method */))) {
                        return type;
                    }
                    break;
                case 8192 /* generic */:
                    if (findObjectType(type.target, depth + 1)) {
                        return type;
                    }
                    break;
                case 8388608 /* intersection */:
                    return type.operands.some(findObjectType) ? type : null;
                case 4194304 /* union */:
                    let result = null;
                    for (const operand of type.operands) {
                        const child = findObjectType(operand, depth + 1);
                        if (child) {
                            if (result) {
                                return null;
                            }
                            result = child;
                        }
                    }
                    return result;
                case 131072 /* array */:
                    return findObjectType(type.element, depth + 1);
            }
            return null;
        }
    }
    /**
     * 渲染文档中的表达式
     * @param expression 要渲染的表达式
     * @param context 生成 Markdown 的上下文
     */
    renderDocExpression(expression, context) {
        if (typeof expression === "string") {
            return jsx("code", null, expression);
        }
        if (typeof expression === "number") {
            return jsx("code", null,
                jsx("span", { class: "doc-token-number" }, expression));
        }
        const text = this.builder.typeScriptCompiler.compile(expression.getText(), "<input>.tsx", false, undefined, null, {
            target: "esnext",
            module: "esnext",
            jsx: "preserve",
            sourceMap: false
        }).content;
        const code = highlight(text, "js", "doc-token-");
        return jsx("code", null, new HTML(code));
    }
    /**
     * 渲染文档中的 markdown 内容
     * @param content 要渲染的内容
     * @param context 生成 Markdown 的上下文
     */
    renderDocMarkdown(content, context) {
        return content ? new HTML(this.markdownCompiler.render(content, context)) : null;
    }
    // #endregion
    // #region 索引页
    /**
     * 生成一个列表页
     * @param url 模块的地址
     */
    async buildIndexPage(path) {
        const url = this.builder.toURL(path);
        const pageIndexURL = `tdk/data/pageIndex/${url}.js`;
        const asset = await this.builder.getAsset(pageIndexURL);
        const { path: sourcePath, header, title, items, body } = asset.content["raw"];
        const [html, count] = this.renderWaterfallList(items, !url || url.endsWith("/") ? url : url + "/");
        const result = await this.buildDocPage(header + body, sourcePath, resolvePath(path, "index.html"), {
            api: false,
            meta: false,
            narrow: false,
            pager: false,
            injectHead: html,
            title,
            subtitle: jsx("span", { class: "doc-tag" }, count)
        });
        result.dependencies.push(...asset.dependencies);
        return result;
    }
    /**
     * 渲染多个瀑布流
     * @param items 要渲染的数据
     * @param baseURL 每个目录项的根地址
     */
    renderWaterfallList(items, baseURL) {
        var _a;
        let html = "";
        let count = 0;
        const globalItems = [];
        for (const item of items) {
            if ((_a = item.children) === null || _a === void 0 ? void 0 : _a.every(child => child.children)) {
                const [childHTML, childCount] = this.renderWaterFall(item.children, baseURL);
                html += jsx("h2", { id: item.title },
                    item.title,
                    item.subtitle ? jsx("small", null, item.subtitle) : null,
                    jsx("span", { class: "doc-tag" }, childCount));
                html += childHTML;
                count += childCount;
            }
            else {
                globalItems.push(item);
            }
        }
        if (globalItems.length) {
            const [childHTML, childCount] = this.renderWaterFall(globalItems, baseURL);
            html = childHTML + html;
            count += childCount;
        }
        return [new HTML(html), count];
    }
    /**
     * 渲染一个瀑布流
     * @param items 要渲染的数据
     * @param baseURL 每个目录项的根地址
     */
    renderWaterFall(items, baseURL) {
        let html = "";
        let count = 0;
        const globalItems = items.filter(item => !item.children);
        const [childHTML, childCount] = this.renderWaterFallSection(globalItems, baseURL);
        if (childCount) {
            html = jsx("section", { class: "doc-waterfall-item", style: `grid-row-end: span ${childCount + 1}` },
                jsx("ul", null, childHTML));
            count = childCount;
        }
        for (const item of items) {
            if (item.children) {
                const [childHTML, childCount] = this.renderWaterFallSection(item.children, baseURL);
                if (childCount) {
                    html += jsx("section", { class: "doc-waterfall-item", style: `grid-row-end: span ${childCount + 3}` },
                        jsx("h4", null,
                            item.title,
                            item.subtitle ? jsx("small", null, item.subtitle) : null,
                            jsx("span", { class: "doc-tag" }, childCount)),
                        jsx("ul", null, childHTML));
                    count += childCount;
                }
            }
        }
        return [jsx("div", { class: "doc-waterfall" }, new HTML(html)), count];
    }
    /**
     * 渲染瀑布流的一个区块
     * @param items 要渲染的数据
     * @param baseURL 每个目录项的根地址
     */
    renderWaterFallSection(items, baseURL) {
        let html = "";
        let count = 0;
        for (const item of items) {
            if (item.children) {
                const [childHTML, childCount] = this.renderWaterFallSection(item.children, baseURL);
                html += childHTML;
                count += childCount;
            }
            else if (item.url !== undefined) {
                html += jsx("li", null,
                    jsx("a", { href: this.options.baseURL + baseURL + this.builder.getHTMLOutputName(item.url) },
                        item.title,
                        item.subtitle ? jsx("small", null, item.subtitle) : null));
                count++;
            }
        }
        return [new HTML(html), count];
    }
    /**
     * 添加指定页面对应的搜索关键字
     * @param url 页面地址
     * @param keyword 要添加的关键字
     */
    addSearchKeyword(url, keyword) {
        var _a;
        var _b;
        const keywords = (_a = (_b = this.searchKeywords)[url]) !== null && _a !== void 0 ? _a : (_b[url] = []);
        pushIfNotExists(keywords, keyword);
    }
    /**
     * 生成前端页面需要的数据
     * @param url 当前页面的地址
     */
    async buildData(url) {
        if (url.startsWith("pageIndex/") && url.endsWith(".js")) {
            const name = url.slice("pageIndex/".length, -".js".length);
            const dir = resolvePath(this.builder.options.baseDir, name);
            const data = await this.loadPageIndex(dir);
            const buffer = Buffer.from(`DOC.setPageIndexData(${JSON.stringify(data.items, (key, value) => {
                if (key === "indent" || key === "raw" || key === "checked") {
                    return;
                }
                if (key === "url") {
                    return value === undefined ? value : this.builder.getHTMLOutputName(value);
                }
                if (Array.isArray(value)) {
                    return value.filter(item => item.checked !== false);
                }
                return value;
            })});`);
            buffer["raw"] = data;
            return {
                content: buffer,
                dependencies: data.dependencies
            };
        }
        if (url === "searchIndex.js") {
            const searchIndex = new SearchIndexManager();
            const dependencies = [];
            for (const root of await this.builder.getRootDirNames()) {
                const data = await this.builder.getAsset(`tdk/data/pageIndex/${root}.js`);
                if (data.type !== 1 /* file */) {
                    continue;
                }
                const { items } = data.content["raw"];
                addItems(items, root, this.builder);
                if (data.dependencies) {
                    dependencies.push(...data.dependencies);
                }
            }
            return {
                content: `DOC.setSearchIndexData(${JSON.stringify({
                    items: searchIndex.items,
                    pinyins: searchIndex.pinyins
                })});`,
                dependencies
            };
            function addItems(items, root, builder) {
                for (const item of items) {
                    if (item.url) {
                        searchIndex.add(item.title, item.subtitle, joinPath(root, builder.getHTMLOutputName(item.url)), builder.docCompiler.searchKeywords[item.url]);
                    }
                    if (item.children) {
                        addItems(item.children, root, builder);
                    }
                }
            }
        }
        if (url === "testIndex.js") {
            const matcher = new Matcher("*.test.{js,jsx,ts,tsx}", this.builder.options.baseDir);
            if (this.builder.options.ignore) {
                matcher.exclude(this.builder.options.ignore);
                matcher.exclude(this.builder.options.outDir);
            }
            const tests = await this.builder.fs.glob(matcher);
            return {
                content: `DOC.renderUnitTest(${JSON.stringify(tests.map(test => setExt(this.builder.toURL(test), ".js")))});`,
                dependencies: [path => /\.test\.(?:js|jsx|ts|tsx)$/i.test(path)]
            };
        }
    }
    /**
     * 获取动态生成的所有文件的地址
     */
    async *getGeneratedDataURLs() {
        for (const entry of await this.builder.getRootDirNames()) {
            yield `pageIndex/${entry}.js`;
        }
        yield "searchIndex.js";
        yield "testIndex.js";
    }
    /**
     * 获取指定文件夹的索引数据
     * @param dir 要扫描的文件夹绝对路径
     */
    async loadPageIndex(dir) {
        const result = {
            autoGenerated: false,
            path: joinPath(dir, `index.md`),
            dependencies: [],
            header: "",
            title: "",
            body: "",
            items: undefined
        };
        // 先扫描 index.md 文件是否包含索引信息
        const listContent = await this.builder.fs.readText(result.path, false);
        if (listContent !== null) {
            const meta = parseMarkdownMeta(listContent);
            const list = parseMarkdownList(meta.body);
            result.header = meta.header;
            result.title = meta.title;
            result.body = list.rest;
            if (result.items = list.items) {
                result.dependencies.push(result.path);
                return result;
            }
        }
        result.autoGenerated = true;
        result.title = getName(dir).toUpperCase();
        result.items = await this.generatePageIndex(dir);
        result.dependencies.push(path => containsPath(dir, path) && this.builder.getOutputNames(path).some(name => name.endsWith(".html")));
        return result;
    }
    /**
     * 扫描并生成指定文件夹的页面列表
     * @param dir 要扫描的文件夹
     * @param root 所属的根文件夹
     * @param extensions 扫描的文件扩展名
     */
    async generatePageIndex(dir, root = dir, extensions) {
        if (extensions === undefined) {
            extensions = [];
            for (const compiler of this.builder.compilers) {
                if (compiler.outExt === ".html") {
                    extensions.push(...compiler.inExts);
                }
            }
        }
        const list = [];
        const entries = await this.builder.fs.readDir(dir, true);
        next: for (const entry of entries) {
            const path = joinPath(dir, entry.name);
            if (entry.isDirectory()) {
                // 如果文件夹存在首页，则链到首页
                const mainPath = joinPath(path, this.builder.getMainFileName(path) + ".md");
                const mainFileInfo = await this.loadPageIndexItem(mainPath);
                if (mainFileInfo) {
                    mainFileInfo.url = relativePath(root, path) + "/";
                    list.push(mainFileInfo);
                    continue;
                }
                // 否则遍历文件夹
                const childList = await this.generatePageIndex(path, root, extensions);
                if (childList.length) {
                    list.push({
                        title: entry.name.toUpperCase(),
                        children: childList
                    });
                }
                continue;
            }
            // 文件：仅支持可生成 .html 的文件
            const index = extensions.indexOf(getExt(entry.name).toLowerCase());
            if (index < 0) {
                continue;
            }
            // 如果有多个同名文件都能生成 .html，按编译器配置选择优先级
            for (let i = 0; i < index; i++) {
                if (entries.find(other => pathEquals(other.name, setExt(entry.name, extensions[i]), this.builder.fs.isCaseInsensitive))) {
                    continue next;
                }
            }
            // 排除根目录的 index.md 和首页.md
            if (root.length === dir.length) {
                const entryName = getName(entry.name, false);
                if (entryName === "index" || entryName === "README" || entryName === this.builder.getMainFileName(dir)) {
                    continue;
                }
            }
            const info = await this.loadPageIndexItem(path);
            if (info) {
                info.url = relativePath(root, path);
                list.push(info);
            }
        }
        list.sort((x, y) => {
            if (!x.children !== !y.children) {
                return x.children ? -1 : 1;
            }
            return x.title < y.title ? -1 : x.title > y.title ? 1 : 0;
        });
        return list;
    }
    /**
     * 解析指定页面对应的列表项
     * @param path 要查询的页面
     * @param checkExists 是否检查文件是否存在
     */
    async loadPageIndexItem(path, checkExists) {
        var _a;
        if (/\.md$/i.test(path)) {
            const content = await this.builder.fs.readText(path, false);
            if (content !== null) {
                const meta = this.parseMarkdownMeta(content, path);
                return {
                    title: (_a = meta.name) !== null && _a !== void 0 ? _a : meta.title,
                    subtitle: meta.name ? meta.title : undefined
                };
            }
            return null;
        }
        if (checkExists && !await this.builder.fs.existsFile(path)) {
            return null;
        }
        return {
            title: getName(path, false)
        };
    }
    /**
     * 获取指定地址对应的页面索引地址
     * @param url 要处理的地址
     */
    getPageIndexURL(url) {
        return "tdk/data/pageIndex/" + getRoot(url) + ".js";
    }
    /**
     * 获取搜索索引地址
     * @param url 要处理的地址
     */
    getSearchIndexURL(url) {
        return "tdk/data/searchIndex.js";
    }
    // #endregion
    // #region 其它
    /**
     * 构建一个单元测试页
     * @param url 当前页面的地址
     */
    buildUnitTestPage(url) {
        return {
            content: this.renderUnitTestPage(url)
        };
    }
    /**
     * 渲染一个单元测试页
     * @param url 当前页面的地址
     */
    renderUnitTestPage(url) {
        return `<!DOCTYPE html>` + jsx("html", { lang: this.builder.options.locale, class: "doc-page" },
            jsx("head", null,
                jsx("meta", { charset: "UTF-8" }),
                jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
                jsx("title", null,
                    "\u5355\u5143\u6D4B\u8BD5 - ",
                    this.options.displayName),
                jsx("link", { rel: "stylesheet", href: this.options.baseURL + "tdk/assets/qunit.css" }),
                this.renderHead(url, { pageIndexRoot: undefined, ajaxLoading: false }),
                jsx("script", { src: this.options.baseURL + "tdk/assets/require.js", defer: true }),
                jsx("script", { src: this.options.baseURL + "tdk/assets/qunit.js", defer: true }),
                jsx("script", { src: this.options.baseURL + "tdk/assets/unittest.js", defer: true }),
                jsx("script", { src: this.options.baseURL + "tdk/data/testIndex.js", defer: true })),
            jsx("body", null,
                this.renderHeader(url),
                jsx("main", { class: "doc-body" },
                    jsx("article", { class: "doc-article" },
                        jsx("div", { id: "qunit" },
                            jsx("span", { class: "doc-tip" },
                                jsx("span", { class: "doc-spinner doc-icon-space-right" }),
                                "\u6B63\u5728\u8F7D\u5165\u6D4B\u8BD5\u7528\u4F8B...")),
                        jsx("div", { id: "qunit-fixture" })),
                    this.options.backToTop ? jsx("div", { class: "doc-section doc-back-to-top" },
                        jsx("a", { href: "#", title: "\u8FD4\u56DE\u9876\u90E8", onclick: "DOC.backToTop(); return false;" }, this.renderIcon("top"))) : null),
                this.renderFooter(url),
                this.renderFoot(url)));
    }
    /**
     * 构建一个首页
     * @param url 当前页面的地址
     */
    buildHomePage(url) {
        return {
            content: this.renderHomePage(url)
        };
    }
    /**
     * 渲染一个首页
     * @param url 当前页面的地址
     */
    renderHomePage(url) {
        var _a, _b, _c;
        const githubURLMatch = /^(?:https?:)\/\/github\.com*\/([^\/]*)\/([^\/]*)/i.exec(this.options.repository);
        return `<!DOCTYPE html> ` + jsx("html", { lang: this.builder.options.locale, class: "doc-page doc-page-index" },
            jsx("head", null,
                jsx("meta", { charset: "UTF-8" }),
                jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
                jsx("title", null, this.options.displayName),
                this.renderHead(url, { pageIndexRoot: undefined, ajaxLoading: false }),
                jsx("link", { rel: "stylesheet", href: this.options.baseURL + "tdk/assets/index.css" })),
            jsx("body", { class: "doc-section" },
                this.renderHeader(url),
                jsx("main", { class: "doc-main" },
                    jsx("section", { class: "doc-intro" },
                        jsx("div", { class: "doc-container" },
                            jsx("div", { class: "doc-intro-logo" }, new HTML(this.options.logo)),
                            jsx("div", { class: "doc-intro-body" },
                                jsx("h1", { class: "doc-intro-title" }, this.options.displayName),
                                jsx("p", { class: "doc-intro-description" }, this.options.introDescription),
                                jsx("div", { class: "doc-intro-buttons" }, (_a = this.options.introButtons) === null || _a === void 0 ? void 0 : _a.map((button, index) => this.renderLink(button.label, button.href, button.title, `doc-intro-button${index ? "" : " doc-intro-button-primary"} `)))))),
                    this.options.packageName ? jsx("section", { class: "doc-download" },
                        jsx("div", { class: "doc-container" },
                            jsx("h2", null, "\u5B89\u88C5"),
                            jsx("div", { class: "doc-download-body" },
                                jsx("div", { class: "doc-download-command" },
                                    jsx("label", { title: "npm" }, this.renderIcon("npm")),
                                    jsx("pre", { class: "doc" },
                                        jsx("button", { type: "button", "aria-hidden": "true", class: "doc-toolbar-button doc-code-tool-copy", onclick: "DOC.handleCopy(this, '\u5DF2\u590D\u5236', '\u590D\u5236\u5931\u8D25')" },
                                            this.renderIcon("copy"),
                                            jsx("span", { class: "doc-section doc-tooltip doc-arrow" }, "\u590D\u5236")),
                                        jsx("code", null,
                                            "npm install ",
                                            this.options.packageName))),
                                jsx("div", { class: "doc-download-command" },
                                    jsx("label", { title: "yarn" }, this.renderIcon("yarn")),
                                    jsx("pre", { class: "doc" },
                                        jsx("button", { type: "button", "aria-hidden": "true", class: "doc-toolbar-button doc-code-tool-copy", onclick: "DOC.handleCopy(this, '\u5DF2\u590D\u5236', '\u590D\u5236\u5931\u8D25')" },
                                            this.renderIcon("copy"),
                                            jsx("span", { class: "doc-section doc-tooltip doc-arrow" }, "\u590D\u5236")),
                                        jsx("code", { class: "doc-language-bash" },
                                            "yarn add ",
                                            this.options.packageName))),
                                githubURLMatch ? jsx("div", { class: "doc-download-command" },
                                    jsx("iframe", { src: `https://ghbtns.com/github-btn.html?user=${githubURLMatch[1]}&repo=${githubURLMatch[2]}&type=star&count=true`, frameborder: "0", scrolling: "0", width: "100", height: "20" }),
                                    jsx("iframe", { src: `https://ghbtns.com/github-btn.html?user=${githubURLMatch[1]}&repo=${githubURLMatch[2]}&type=fork&count=true`, frameborder: "0", scrolling: "0", width: "100", height: "20" })) : null))) : null,
                    ((_b = this.options.features) === null || _b === void 0 ? void 0 : _b.length) ? jsx("section", { class: "doc-features" },
                        jsx("div", { class: "doc-container" },
                            jsx("h2", null, "\u7279\u6027"),
                            jsx("ul", { class: "doc-features-body" }, this.options.features.map(feature => jsx("li", null, this.renderLink(jsx(Fragment, null,
                                new HTML(feature.icon || ""),
                                jsx("h3", null, feature.label),
                                jsx("p", null, feature.description)), feature.href, feature.title, "doc-feature-item")))))) : null,
                    ((_c = this.options.links) === null || _c === void 0 ? void 0 : _c.length) ? jsx("section", { class: "doc-resources" },
                        jsx("div", { class: "doc-container" },
                            jsx("h2", null, "\u94FE\u63A5"),
                            jsx("ul", { class: "doc-resources-body" }, this.options.links.map(link => jsx("li", null, this.renderLink(jsx(Fragment, null,
                                jsx("span", { class: "doc-resource-icon" }, new HTML(link.icon || "")),
                                jsx("span", { class: "doc-resource-title" }, link.label)), link.href, link.title, "doc-resource")))))) : null,
                    this.options.support ? jsx("section", { class: "doc-support" }, this.renderLink(this.options.support.label, this.options.support.href, this.options.support.title)) : null),
                this.renderFooter(url),
                this.renderFoot(url)));
    }
    /**
     * 构建一个错误页面
     * @param errors 已解析的错误日志
     * @param ext 文件扩展名
     * @param content 当前文件内容
     */
    buildErrorPage(errors, ext, content) {
        const useHTML = ext === ".js" || ext === ".html";
        let message = useHTML ? `<button style="-webkit-appearance: none;
float: right;
margin: 0;
border: 0;
padding: .25em 0;
background: transparent;
outline: 0;
width: 1em;
color: #e0e0e0;
font-size: 1em;
line-height: 1em;" onclick="this.parentNode.parentNode.removeChild(this.parentNode)" title="关闭">✖</button>` : "";
        const oldTimestamp = this.builder.logger.timestamp;
        this.builder.logger.timestamp = false;
        for (const error of errors) {
            if (useHTML) {
                message += `<div style="margin-bottom: 2em">${ansiToHTML(this.builder.logger.formatLog(error, error.warning ? 5 /* warning */ : 6 /* error */, true), { gray: "#ccc" })}</div>`;
            }
            else {
                if (message)
                    message += "\n\n\n";
                message += this.builder.logger.formatLog(error, error.warning ? 5 /* warning */ : 6 /* error */, false);
            }
        }
        this.builder.logger.timestamp = oldTimestamp;
        const css = `position: fixed;
top: 0;
left: 0;
bottom: 0;
right: 0;
overflow: auto;
z-index: 65535;
box-sizing: border-box;
background: rgba(0, 0, 0, .75);
padding: 2rem;
font-family: Monaco, Menlo, Consolas, "Courier New", "Helvetica Neue", Helvetica, "Hiragino Sans GB", "Microsoft Yahei", monospace;
font-size: 1rem;
white-space: pre-wrap;
color: #ffffff;`;
        switch (ext) {
            case ".js":
                return `/* This file has ${errors.length} compiler error(s) */
!function() {
	var div = document.getElementById("doc_compile_error") || document.body.appendChild(document.createElement("div"));
	div.id = "doc_compile_error";
	div.style.cssText = ${quoteJSString(css)};
	div.innerHTML = ${quoteJSString(message)};
}();`;
            case ".css":
                return `/* This file has ${errors.length} compiler error(s) */
html::after {
	content: ${quoteCSSString(message, '"')};
	${css}
}
${content}`;
            case ".html":
                return `<!{errors.length} compiler error(s) -->\n${(String(content)).replace(/(?=<!--#DOC-ARTICLE-END-->|<\/[bB][oO][dD][yY]>|$)/, `<div id="doc_compile_error" style=${quoteHTMLAttribute(css, '"')}>${message}</div>`)}`;
            default:
                return message;
        }
    }
}
/** 表示代码块的类型 */
var CodeBlockType;
(function (CodeBlockType) {
    /** 仅显示代码 */
    CodeBlockType[CodeBlockType["code"] = 0] = "code";
    /** 仅显示效果 */
    CodeBlockType[CodeBlockType["run"] = 1] = "run";
    /** 上下结构显示效果和源码 */
    CodeBlockType[CodeBlockType["demo"] = 2] = "demo";
    /** 左右结构显示源码和效果 */
    CodeBlockType[CodeBlockType["example"] = 3] = "example";
    /** 测试用例 */
    CodeBlockType[CodeBlockType["test"] = 4] = "test";
})(CodeBlockType || (CodeBlockType = {}));
//# sourceMappingURL=docCompiler.js.map