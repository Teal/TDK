/** 提供文档页面使用的全局函数 */
var DOC;
(function (DOC) {
    /** 当前页面的数据 */
    DOC.pageData = {
        /** 所有链接的基地址 */
        baseURL: "/",
        /** 当前页面的索引根文件夹 */
        pageIndexRoot: "",
        /** 页面索引数据 */
        pageIndexData: undefined,
        /** 当前页面的搜索索引地址 */
        searchIndexURL: undefined,
        /** 当前页面的搜索索引数据 */
        searchIndexData: undefined,
        /** 是否允许异步载入页面 */
        ajaxLoading: true
    };
    /** 初始化页面 */
    function init() {
        // 载入数据
        if (typeof DOC_PAGE_DATA === "object") {
            Object.assign(DOC.pageData, DOC_PAGE_DATA);
        }
        // 改进 Windows 下滚动条样式
        if (navigator.userAgent.indexOf("Windows") >= 0) {
            document.documentElement.classList.add("doc-windows");
        }
        // 首页
        if (document.documentElement.classList.contains("doc-page-index")) {
            return;
        }
        // 同步索引描点位置（如果存在）
        window.addEventListener("scroll", throttle(updateTOCAnchor, 30), { passive: true });
        updateTOCAnchor();
        // 避免点击后刷新页面，提升用户体验
        if (DOC.pageData.ajaxLoading) {
            document.documentElement.addEventListener("click", async (e) => {
                const anchor = e.target.closest("a");
                if (!anchor
                    || anchor.target && anchor.target !== "_self"
                    || anchor.getAttribute("href").startsWith("#")
                    || !anchor.pathname.startsWith(DOC.pageData.baseURL + DOC.pageData.pageIndexRoot)
                    || anchor.protocol !== location.protocol
                    || anchor.host !== location.host) {
                    return;
                }
                const url = anchor.href;
                // 存储当前的滚动位置以便返回时滚回当前位置
                const state = {
                    type: "__doc__",
                    scrollLeft: document.documentElement.scrollLeft,
                    scrollTop: document.documentElement.scrollTop
                };
                history.replaceState(state, document.title, location.href);
                if (location.href !== url) {
                    history.pushState(state, document.title, url);
                }
                e.preventDefault();
                if (!await loadPage(url)) {
                    location.replace(location.href);
                }
            });
            window.addEventListener("popstate", e => {
                const currentState = e.state;
                if ((currentState === null || currentState === void 0 ? void 0 : currentState.type) === "__doc__") {
                    loadPage(location.href, currentState.scrollLeft, currentState.scrollTop);
                }
                else if (location.hash) {
                    // Edge: 修复动画滚动失效
                    const hash = decodeURIComponent(location.hash);
                    const target = document.getElementById(hash.substring(1));
                    if (target) {
                        const toc = document.querySelector(".doc-toc-container");
                        if (toc) {
                            for (const link of toc.getElementsByTagName("a")) {
                                if (link.getAttribute("href") === hash) {
                                    pauseUpdateAnchor = true;
                                    setTimeout(() => {
                                        pauseUpdateAnchor = false;
                                    }, 888);
                                    setTOCAnchor(link, toc);
                                    break;
                                }
                            }
                        }
                        setTimeout(() => {
                            scrollIntoView(target, "smooth");
                        }, 0);
                    }
                }
            });
        }
    }
    DOC.init = init;
    /** 降低固定时间内的函数调用频次 */
    function throttle(func, timeout) {
        let timer;
        return () => {
            timer || (timer = setTimeout(() => {
                timer = 0;
                func();
            }, timeout));
        };
    }
    /**
     * 载入指定的页面
     * @param url 要载入的页面
     * @param scrollLeft 载入后设置的水平滚动位置
     * @param scrollTop 载入后设置的垂直滚动位置
     */
    async function loadPage(url, scrollLeft, scrollTop) {
        const progress = document.querySelector(".doc-progress");
        progress.style.transition = "";
        progress.style.opacity = "1";
        progress.style.width = "99%";
        updateNavMenu(url);
        let contentMatch;
        try {
            const response = await fetch(url);
            const html = await response.text();
            // 如果在请求页面期间页面被重定向到其它地址，忽略本次请求
            if (location.href !== url) {
                return true;
            }
            contentMatch = /<!--#DOC-ARTICLE-START-->([\s\S]*)<!--#DOC-ARTICLE-END-->/.exec(html);
            const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(html);
            document.title = titleMatch ? titleMatch[1] : "";
        }
        catch (_a) {
            return false;
        }
        if (contentMatch) {
            progress.style.width = "100%";
            progress.style.opacity = "0";
            console.clear();
            const article = document.querySelector(".doc-article");
            article.innerHTML = contentMatch[1];
            for (const script of Array.from(article.getElementsByTagName("script"))) {
                const newScript = document.createElement("script");
                newScript.type = script.type;
                newScript.async = false;
                if (script.src) {
                    newScript.src = script.src;
                }
                else {
                    newScript.textContent = script.textContent;
                }
                newScript.onload = script.onload;
                newScript.onerror = script.onerror;
                script.parentNode.replaceChild(newScript, script);
            }
            if (scrollTop === undefined) {
                const hashIndex = url.indexOf("#");
                const target = hashIndex >= 0 ? document.getElementById(decodeURIComponent(url.substring(hashIndex + 1))) : null;
                if (target) {
                    scrollIntoView(target, "auto");
                }
                else {
                    window.scrollTo({
                        left: 0,
                        top: 0,
                        behavior: "auto"
                    });
                }
            }
            else {
                window.scrollTo({
                    left: scrollLeft,
                    top: scrollTop,
                    behavior: "auto"
                });
            }
            setTimeout(() => {
                progress.style.transition = "none";
                progress.style.width = "0";
                progress.style.width = "1";
            }, 150);
            return true;
        }
        else {
            return false;
        }
    }
    DOC.loadPage = loadPage;
    /**
     * 将元素滚动到可见范围
     * @param elem 要滚动的元素
     * @param behavior 滚动的动画
     */
    function scrollIntoView(elem, behavior) {
        window.scrollTo({
            top: elem.getBoundingClientRect().top - document.querySelector(".doc-article").getBoundingClientRect().top + 14,
            behavior: behavior
        });
    }
    /** 在小屏模式切换导航条的显示 */
    function toggleNavbar() {
        if (document.body.classList.toggle("doc-navbar-open")) {
            document.addEventListener("click", handleNavbarBodyClick);
        }
        else {
            document.removeEventListener("click", handleNavbarBodyClick);
        }
    }
    DOC.toggleNavbar = toggleNavbar;
    /** 在小屏模式显示导航条时处理全局点击事件 */
    function handleNavbarBodyClick(e) {
        if (e.target.closest(".doc-navbutton-navbar")) {
            return;
        }
        toggleNavbar();
    }
    /** 在小屏模式切换搜索框的显示 */
    function toggleSearch() {
        if (document.body.classList.toggle("doc-search-open")) {
            document.addEventListener("click", handleSearchBodyClick);
            document.querySelector(".doc-search > input").focus();
        }
        else {
            document.removeEventListener("click", handleSearchBodyClick);
        }
    }
    DOC.toggleSearch = toggleSearch;
    /** 在小屏模式显示搜索框时处理全局点击事件 */
    function handleSearchBodyClick(e) {
        if (e.target.closest(".doc-navbutton-search") || e.target.closest(".doc-search")) {
            return;
        }
        toggleSearch();
    }
    /** 显示搜索结果 */
    function showSearchResult() {
        if (!DOC.pageData.searchIndexData) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = DOC.pageData.baseURL + DOC.pageData.searchIndexURL;
            document.querySelector(".doc-search").appendChild(script);
        }
        let popup = document.querySelector(".doc-search > .doc-popup");
        if (!popup) {
            popup = document.querySelector(".doc-search").appendChild(document.createElement("menu"));
            popup.className = "doc-menu doc-popup";
            popup.innerHTML = `<li><label class="doc-tip"><span class="doc-spinner doc-icon-space-right"></span>正在载入列表...</label></li>`;
        }
        if (popup.classList.contains("doc-popup-show")) {
            return;
        }
        popup.classList.add("doc-popup-show");
        document.addEventListener("click", handleSearchResultBodyClick);
    }
    DOC.showSearchResult = showSearchResult;
    /** 在小屏模式显示搜索结果时处理全局点击事件 */
    function handleSearchResultBodyClick(e) {
        if (e.target.tagName === "INPUT" || e.target.closest(".doc-navbutton-search")) {
            return;
        }
        hideSearchResult();
    }
    /** 隐藏搜索菜单 */
    function hideSearchResult() {
        if (document.body.classList.contains("doc-search-open")) {
            toggleSearch();
        }
        document.removeEventListener("click", handleSearchResultBodyClick);
        document.querySelector(".doc-search > .doc-popup").classList.remove("doc-popup-show");
    }
    DOC.hideSearchResult = hideSearchResult;
    /**
     * 设置搜索索引数据
     * @param data 要设置的数据
     */
    function setSearchIndexData(data) {
        DOC.pageData.searchIndexData = data;
        updateSearchResult();
    }
    DOC.setSearchIndexData = setSearchIndexData;
    /** 更新搜索结果 */
    function updateSearchResult() {
        if (!DOC.pageData.searchIndexData) {
            return;
        }
        const search = document.querySelector(".doc-search > input");
        const menu = document.querySelector(".doc-search > .doc-menu");
        menu.innerHTML = formatSearchResult(getSearchResult(DOC.pageData.searchIndexData, search.value));
        /**
         * 执行搜索并返回搜索结果
         * @param index 所有搜索索引数据
         * @param pattern 要搜索的内容
         */
        function getSearchResult(index, pattern) {
            pattern = pattern.trim().toLowerCase();
            if (!pattern) {
                return index.items;
            }
            const getPinYin = (char) => index.pinyins[char];
            const result = [];
            for (const item of index.items) {
                const nameMatch = matchPinYin(item.title, pattern, getPinYin);
                if (nameMatch) {
                    result.push({
                        url: item.url,
                        title: item.title,
                        titleMatch: nameMatch,
                        subtitle: item.subtitle,
                        subtitleMatch: item.subtitle ? matchPinYin(item.subtitle, pattern, getPinYin) : undefined
                    });
                    continue;
                }
                let content;
                let match = (content = item.subtitle) ? matchPinYin(content, pattern, getPinYin) : (content = item.url) ? matchPinYin(content, pattern, getPinYin) : null;
                if (!match && item.keywords) {
                    for (const keyword of item.keywords) {
                        if (match = matchPinYin(keyword, pattern, getPinYin)) {
                            content = keyword;
                            break;
                        }
                    }
                }
                if (match) {
                    result.push({
                        url: item.url,
                        title: item.title,
                        subtitle: content,
                        subtitleMatch: match
                    });
                    break;
                }
            }
            result.sort((x, y) => {
                var _a, _b, _c, _d;
                if (x.titleMatch && y.titleMatch) {
                    return y.titleMatch.order - x.titleMatch.order;
                }
                if (x.titleMatch || y.titleMatch) {
                    return x.titleMatch ? -1 : 1;
                }
                return ((_b = (_a = y.subtitleMatch) === null || _a === void 0 ? void 0 : _a.order) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = x.subtitleMatch) === null || _c === void 0 ? void 0 : _c.order) !== null && _d !== void 0 ? _d : 0);
            });
            return result;
        }
        /** 格式化搜索结果列表 */
        function formatSearchResult(searchResult) {
            if (!searchResult.length) {
                return `<li><label class="doc-tip"><svg class="doc-icon doc-icon-space-right" viewBox="0 0 24 24"><use xlink:href="${DOC.pageData.baseURL}tdk/assets/icons.svg#info"></use></svg>无匹配结果</label></li>`;
            }
            return searchResult.map(item => `<li><a href="${encodeHTML(DOC.pageData.baseURL + item.url)}">${formatMatch(item.title, item.titleMatch)}${item.subtitle ? `<small>${formatMatch(item.subtitle, item.subtitleMatch)}</small>` : ""}`).join("");
        }
    }
    DOC.updateSearchResult = updateSearchResult;
    /**
     * 使用指定的模式匹配拼音
     * @param input 被匹配的内容
     * @param pattern 要匹配的模式
     * @param getPinYin 获取单个字符拼音的回调函数
     * @returns 返回包含所有匹配索引的数组，如果不匹配则返回 `undefined`
     */
    function matchPinYin(input, pattern, getPinYin) {
        return matchFrom(0, 0);
        function matchFrom(inputIndex, patternIndex) {
            for (; inputIndex < input.length; inputIndex++) {
                // 跳过单词主体，避免匹配单词中的某个部分
                if (inputIndex) {
                    const char = input.charCodeAt(inputIndex);
                    if (char <= 122 /*z*/ && char >= 97 /*a*/) {
                        const prevChar = input.charCodeAt(inputIndex - 1);
                        if (prevChar <= 122 /*z*/ && prevChar >= 97 /*a*/ || prevChar <= 90 /*Z*/ && prevChar >= 65 /*A*/) {
                            continue;
                        }
                    }
                    else if (char <= 57 /*9*/ && char >= 48 /*0*/) {
                        const prevChar = input.charCodeAt(inputIndex - 1);
                        if (prevChar <= 57 /*9*/ && prevChar >= 48 /*0*/) {
                            continue;
                        }
                    }
                }
                const result = matchAt(inputIndex, patternIndex);
                if (result) {
                    inputIndex = result[result.length];
                    const nextMatch = matchFrom(result[result.length - 1] + 1, 0);
                    if (nextMatch) {
                        result.push(...nextMatch);
                        result.order += nextMatch.order;
                    }
                    if (!inputIndex) {
                        result.order++;
                    }
                    return result;
                }
            }
        }
        function matchAt(inputIndex, patternIndex) {
            // 已全部匹配
            if (patternIndex === pattern.length) {
                const result = [];
                result.order = 0;
                return result;
            }
            const inputCode = input.charCodeAt(inputIndex);
            const patternCode = pattern.charCodeAt(patternIndex);
            // 精确匹配
            if (toLower(inputCode) === toLower(patternCode)) {
                const result = matchAt(inputIndex + 1, patternIndex + 1);
                if (result) {
                    result.unshift(inputIndex);
                    result.order += pattern.length * (inputCode === patternCode ? 5 : 4);
                    return result;
                }
            }
            // 小写英文：b 可匹配 extBox 中的 b
            if (inputCode <= 122 /*z*/ && inputCode >= 97 /*a*/) {
                while (++inputIndex < input.length) {
                    let char = input.charCodeAt(inputIndex);
                    // 跳过当前字母后的所有小写字母
                    if (char >= 97 /*a*/ && char <= 122 /*z*/) {
                        continue;
                    }
                    // 跳过第一个字母和数字前的特殊符号
                    while (char !== patternCode && inputIndex < input.length && !(char >= 97 /*a*/ && char <= 122 /*z*/ || char <= 90 /*Z*/ && char >= 65 /*A*/ || char <= 57 /*9*/ && char >= 48 /*0*/)) {
                        char = input.charCodeAt(++inputIndex);
                    }
                    if (toLower(char) === toLower(patternCode)) {
                        const result = matchAt(inputIndex + 1, patternIndex + 1);
                        if (result) {
                            result.unshift(inputIndex);
                            result.order += pattern.length * 2;
                            return result;
                        }
                    }
                    break;
                }
            }
            // 中文：匹配任一个拼音
            const pinyins = getPinYin(input[inputIndex]);
            if (pinyins) {
                for (const pinyin of pinyins) {
                    // 比如 sh 既可以匹配“是”，也可以匹配“时候”
                    for (let i = 0; i < pinyin.length && patternIndex + i < pattern.length && pinyin.charCodeAt(i) === pattern.charCodeAt(patternIndex + i); i++) {
                        const result = matchAt(inputIndex + 1, patternIndex + i + 1);
                        if (result) {
                            result.unshift(inputIndex);
                            result.order += pattern.length * 3;
                            return result;
                        }
                    }
                }
            }
            // 空格：子模式匹配
            if (patternCode === 32 /* */) {
                return matchFrom(inputIndex, patternIndex + 1);
            }
        }
        function toLower(code) {
            return code <= 90 && code >= 65 ? code | 32 : code;
        }
    }
    DOC.matchPinYin = matchPinYin;
    /**
     * 格式化匹配结果为一个字符串
     * @param input 被匹配的内容
     * @param matchResult 包含所有匹配起止位置的数组
     * @return 返回拼接后的文本内容
     * @example formatMatch("ab", [0]) // "<mark>a</mark>b"
     */
    function formatMatch(input, matchResult) {
        if (!matchResult) {
            return encodeHTML(input);
        }
        let result = "";
        for (let i = 0; i < input.length; i++) {
            if (matchResult.includes(i)) {
                result += `<mark>${input[i]}</mark>`;
            }
            else {
                result += encodeHTML(input[i]);
            }
        }
        return result;
    }
    DOC.formatMatch = formatMatch;
    /**
     * 编码 HTML 转义字符
     * @param value 要编码的字符串
     * @returns 返回已编码的字符串。HTML 特殊字符 `&`、`<`、`>`、`'`、`"` 分别会被编码成 `&amp;`、`&lt;`、`&gt;`、`&#39;`、`&quot;`。
     * @example encodeHTML("<a></a>") // "&lt;a&gt;&lt;/a&gt;"
     */
    function encodeHTML(value) {
        return value.replace(/[&<>'"]/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\'": "&#39;",
            '\"': "&quot;"
        })[c]);
    }
    DOC.encodeHTML = encodeHTML;
    /** 处理搜索框键盘事件 */
    function handleSearchKeyDown(e) {
        var _a, _b, _c, _d;
        switch (e.key) {
            case "Enter": {
                e.preventDefault();
                const selected = document.querySelector(".doc-search > .doc-popup > .doc-selected > a");
                if (selected) {
                    selected.click();
                    document.querySelector(".doc-search > input").value = "";
                    updateSearchResult();
                    hideSearchResult();
                }
                break;
            }
            case "ArrowUp": {
                e.preventDefault();
                showSearchResult();
                const oldSelected = document.querySelector(".doc-search > .doc-popup > .doc-selected");
                const newSelected = (_a = oldSelected === null || oldSelected === void 0 ? void 0 : oldSelected.previousElementSibling) !== null && _a !== void 0 ? _a : (_b = document.querySelector(".doc-search > .doc-popup")) === null || _b === void 0 ? void 0 : _b.lastElementChild;
                oldSelected === null || oldSelected === void 0 ? void 0 : oldSelected.classList.remove("doc-selected");
                if (newSelected) {
                    newSelected.classList.add("doc-selected");
                    scrollIntoViewIfNeeded(newSelected, newSelected.parentNode);
                }
                break;
            }
            case "ArrowDown": {
                e.preventDefault();
                showSearchResult();
                const oldSelected = document.querySelector(".doc-search > .doc-popup > .doc-selected");
                const newSelected = (_c = oldSelected === null || oldSelected === void 0 ? void 0 : oldSelected.nextElementSibling) !== null && _c !== void 0 ? _c : (_d = document.querySelector(".doc-search > .doc-popup")) === null || _d === void 0 ? void 0 : _d.firstElementChild;
                oldSelected === null || oldSelected === void 0 ? void 0 : oldSelected.classList.remove("doc-selected");
                if (newSelected) {
                    newSelected.classList.add("doc-selected");
                    scrollIntoViewIfNeeded(newSelected, newSelected.parentNode);
                }
                break;
            }
            case "Escape":
                e.preventDefault();
                hideSearchResult();
                break;
        }
    }
    DOC.handleSearchKeyDown = handleSearchKeyDown;
    /**
     * 如果元素不可见则滚动到可见位置
     * @param elem 要显示的目标元素
     * @param scrollParent 可滚动的容器
     * @param alignCenter 是否将目标元素居中显示
     */
    function scrollIntoViewIfNeeded(elem, scrollParent, alignCenter) {
        const deltaY = elem.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top;
        const deltaHeight = scrollParent.offsetHeight - elem.offsetHeight;
        if (deltaY < 0 || deltaY > deltaHeight) {
            const offsetY = alignCenter ? deltaHeight / 2 : 0;
            scrollParent.scrollTop = scrollParent.scrollTop + deltaY - (deltaY < 0 ? offsetY : deltaHeight - offsetY);
        }
    }
    DOC.scrollIntoViewIfNeeded = scrollIntoViewIfNeeded;
    /** 在小屏模式切换侧边栏的显示 */
    function toggleSidebar() {
        if (document.body.classList.toggle("doc-sidebar-open")) {
            document.addEventListener("click", handleSidebarBodyClick);
        }
        else {
            document.removeEventListener("click", handleSidebarBodyClick);
        }
    }
    DOC.toggleSidebar = toggleSidebar;
    /** 在小屏模式显示侧边栏时处理全局点击事件 */
    function handleSidebarBodyClick(e) {
        if (e.target.closest(".doc-navbutton-sidebar") || e.target.closest(".doc-navmenu-collapsible")) {
            return;
        }
        toggleSidebar();
    }
    /**
     * 初始化导航菜单
     * @param data 菜单的数据
     */
    function setPageIndexData(data) {
        DOC.pageData.pageIndexData = data;
        document.querySelector(".doc-navmenu").innerHTML = renderNavMenu(data, 0);
        updateNavMenu(location.href);
    }
    DOC.setPageIndexData = setPageIndexData;
    /** 渲染导航菜单树 */
    function renderNavMenu(data, level) {
        let html = "";
        for (const item of data) {
            const collapsable = item.children;
            const collapsed = level > 0;
            html += `<li${collapsable ? ` class="doc-navmenu-collapsible${collapsed ? " doc-collapsed" : ""}"` : ""}><${item.url ? `a href="${encodeHTML(DOC.pageData.baseURL + DOC.pageData.pageIndexRoot + item.url)}"` : `button type="button"`}>${collapsable ? `<svg class="doc-icon doc-navmenu-collapse-indicator"><use xlink:href="${encodeHTML(DOC.pageData.baseURL)}tdk/assets/icons.svg#chevron-down"></use></svg>` : ""}${encodeHTML(item.title)}${item.subtitle ? `<small>${encodeHTML(item.subtitle)}</small>` : ""}</${item.url ? "a" : "button"}></li>${item.children ? `<li class="doc-navmenu-child"${collapsed ? ` style="display: none;"` : ""}><ul>${renderNavMenu(item.children, level + 1)}</ul></li>` : ""}`;
        }
        return html;
    }
    /**
     * 设置当前高亮的导航菜单地址
     * @param url 当前页面的地址
     */
    function updateNavMenu(url) {
        const oldSelected = document.querySelector(".doc-navmenu .doc-selected");
        if (oldSelected) {
            oldSelected.classList.remove("doc-selected");
            for (const current of document.querySelectorAll(".doc-navmenu-current")) {
                current.classList.remove("doc-navmenu-current");
            }
        }
        const href = url.replace(/[\?#].*$/, "");
        for (const anchor of document.querySelectorAll(`.doc-navmenu a`)) {
            if (anchor.href.replace(/[\?#].*$/, "") === href) {
                anchor.parentNode.classList.add("doc-selected");
                let node = anchor;
                while (true) {
                    const childContainer = node.closest(".doc-navmenu-child");
                    if (childContainer) {
                        const button = childContainer.previousElementSibling;
                        if (button === null || button === void 0 ? void 0 : button.classList.contains("doc-navmenu-collapsible")) {
                            button.classList.add("doc-navmenu-current");
                            button.classList.remove("doc-collapsed");
                            childContainer.style.display = "";
                            node = childContainer.parentNode;
                            continue;
                        }
                    }
                    break;
                }
                scrollIntoViewIfNeeded(anchor, document.querySelector(".doc-navmenu"), true);
                break;
            }
        }
    }
    DOC.updateNavMenu = updateNavMenu;
    /** 当导航菜单点击后触发 */
    function handleNavMenuClick(e) {
        const collapsible = e.target.closest(".doc-navmenu-collapsible");
        if (collapsible) {
            const collapsed = collapsible.classList.toggle("doc-collapsed");
            const child = collapsible.nextElementSibling;
            if (child === null || child === void 0 ? void 0 : child.classList.contains("doc-navmenu-child")) {
                slideToggle(child, !collapsed);
            }
        }
    }
    DOC.handleNavMenuClick = handleNavMenuClick;
    /**
     * 以滑动的方式切换元素的可见性
     * @param elem 要切换的元素
     * @param value 如果为 `true` 则显示元素，否则隐藏元素
     */
    function slideToggle(elem, value) {
        elem.setAttribute("data-animating", value ? "show" : "hide");
        if (value === (elem.style.display !== "none")) {
            return;
        }
        elem.style.display = "";
        const animateEnd = () => {
            elem.style.display = elem.getAttribute("data-animating") === "hide" ? "none" : "";
            elem.removeAttribute("data-animating");
        };
        if (value) {
            animateHeight(elem, 0, elem.offsetHeight, animateEnd);
        }
        else {
            animateHeight(elem, elem.offsetHeight, 0, animateEnd);
        }
    }
    DOC.slideToggle = slideToggle;
    /**
     * 通过渐变动画改变元素的高度
     * @param elem 要处理的元素
     * @param from 开始的高度值
     * @param to 结束的高度值
     * @param callback 动画执行结束后的回调函数
     */
    function animateHeight(elem, from, to, callback) {
        if (from === to) {
            return callback && setTimeout(callback, 0);
        }
        elem.style.overflow = "hidden";
        elem.style.height = from + "px";
        elem.style.marginBottom = elem.style.marginTop = from ? "" : "0";
        elem.clientHeight;
        elem.style.transition = "height .15s, margin-top .15s, margin-bottom .15s";
        elem.style.height = to + "px";
        elem.style.marginBottom = elem.style.marginTop = to ? "" : "0";
        setTimeout(() => {
            elem.style.transition = elem.style.height = elem.style.marginTop = elem.style.marginBottom = elem.style.overflow = "";
            callback === null || callback === void 0 ? void 0 : callback();
        }, 150);
    }
    /** 是否暂停更新图标 */
    let pauseUpdateAnchor = false;
    /** 更新目录中的高亮项 */
    function updateTOCAnchor() {
        if (pauseUpdateAnchor) {
            return;
        }
        const toc = document.querySelector(".doc-toc-container");
        if (!toc) {
            return;
        }
        if (document.documentElement.scrollTop < 10) {
            setTOCAnchor(toc.querySelector(".doc-toc-head > a"), toc);
            return;
        }
        let selectedLink;
        const isEnd = (document.documentElement.scrollHeight - document.documentElement.clientHeight) - document.documentElement.scrollTop < 14;
        const top = document.querySelector(".doc-header").offsetHeight;
        for (const link of toc.getElementsByTagName("a")) {
            const id = link.getAttribute("href").substring(1);
            const elem = document.getElementById(id);
            if (!elem) {
                continue;
            }
            if (!isEnd) {
                const rect = elem.getBoundingClientRect();
                if (rect.top > top) {
                    if (rect.top - top < 14 * 6) {
                        selectedLink = link;
                    }
                    break;
                }
            }
            selectedLink = link;
        }
        if (selectedLink) {
            setTOCAnchor(selectedLink, toc);
        }
    }
    DOC.updateTOCAnchor = updateTOCAnchor;
    /** 设置当前高亮的目录描点 */
    function setTOCAnchor(selectedLink, toc) {
        var _a;
        (_a = toc.querySelector(".doc-selected")) === null || _a === void 0 ? void 0 : _a.classList.remove("doc-selected");
        const li = selectedLink.parentNode;
        li.classList.add("doc-selected");
        const anchor = document.querySelector(".doc-toc-anchor");
        const top = selectedLink.getBoundingClientRect().top - toc.querySelector("ul").getBoundingClientRect().top;
        anchor.style.top = top + "px";
        const height = toc.offsetHeight;
        if (toc.scrollTop < top - height + 60) {
            toc.scrollTop = top - height + 60;
        }
        else if (toc.scrollTop > top - 60) {
            toc.scrollTop = top - 60;
        }
    }
    /** 在小屏模式切换目录的展开或折叠状态 */
    function toggleTOCCollapse() {
        const toc = document.body.querySelector(".doc-toc");
        const ul = toc.querySelector("ul");
        toc.classList.toggle("doc-collapsed", toggleCollapse(ul));
    }
    DOC.toggleTOCCollapse = toggleTOCCollapse;
    /** 切换元素的折叠状态 */
    function toggleCollapse(elem, value) {
        if (value !== undefined && value === elem.classList.contains("doc-collapsed")) {
            return value;
        }
        const fromHeight = elem.offsetHeight;
        const collapsed = elem.classList.toggle("doc-collapsed", value);
        const toHeight = elem.offsetHeight;
        if (collapsed) {
            elem.style.maxHeight = "none";
            animateHeight(elem, fromHeight, toHeight, () => {
                elem.style.maxHeight = "";
            });
        }
        else {
            animateHeight(elem, fromHeight, toHeight);
        }
        return collapsed;
    }
    DOC.toggleCollapse = toggleCollapse;
    /**
     * 处理复制按钮点击事件
     * @param elem 点击的元素
     * @param successTip 复制成功的文案
     * @param errorTip 复制失败的文案
     */
    function handleCopy(elem, successTip, errorTip) {
        var _a, _b;
        (_a = elem.onmouseleave) === null || _a === void 0 ? void 0 : _a.call(elem, null);
        const content = ((_b = elem.parentNode.parentNode.querySelector("pre > code")) !== null && _b !== void 0 ? _b : elem.parentNode.parentNode.parentNode.querySelector("pre > code")).textContent;
        copyText(content, result => {
            const toolTip = elem.querySelector(".doc-tooltip");
            const oldHTML = toolTip.innerHTML;
            toolTip.innerHTML = result ? `<svg class="doc-icon"><use xlink:href="${encodeHTML(DOC.pageData.baseURL)}tdk/assets/icons.svg#checkmark"></use></svg> ${successTip}` : errorTip;
            elem.onmouseleave = () => {
                elem.onmouseleave = null;
                toolTip.innerHTML = oldHTML;
            };
        });
    }
    DOC.handleCopy = handleCopy;
    /**
     * 复制指定的文本到剪贴板
     * @param text 要复制的内容
     * @param callback 操作完成后的回调函数
     * @param nativeClipboard 如果可用，是否使用原生的剪贴板操作
     */
    function copyText(text, callback, nativeClipboard) {
        if (navigator.clipboard && nativeClipboard !== false) {
            return navigator.clipboard.writeText(text).then(() => { callback === null || callback === void 0 ? void 0 : callback(true); }, () => { copyText(text, callback, false); });
        }
        const selection = document.getSelection();
        const selected = (selection === null || selection === void 0 ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
        const textArea = document.body.appendChild(document.createElement("textarea"));
        try {
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = textArea.style.left = "-9999px";
            textArea.readOnly = true;
            textArea.select();
            const range = document.createRange();
            range.selectNodeContents(textArea);
            selection.removeAllRanges();
            selection.addRange(range);
            textArea.setSelectionRange(0, text.length);
            const success = document.execCommand("Copy");
            callback === null || callback === void 0 ? void 0 : callback(success);
        }
        catch (err) {
            callback === null || callback === void 0 ? void 0 : callback(false);
        }
        finally {
            document.body.removeChild(textArea);
            if (selected) {
                selection.removeAllRanges();
                selection.addRange(selected);
            }
        }
    }
    DOC.copyText = copyText;
    /**
     * 处理成员筛选框输入事件
     * @param elem 筛选框
     */
    function handleMemberFilter(elem) {
        const api = elem.closest(".doc-api-section");
        const filter = elem.value.trim();
        for (const nameNode of api.querySelectorAll(".doc-api-name")) {
            const item = nameNode.closest(".doc-api-property,.doc-api");
            const apiName = nameNode.textContent;
            const match = matchPinYin(apiName, filter, () => undefined);
            if (match) {
                nameNode.innerHTML = formatMatch(apiName, match);
            }
            else {
                nameNode.textContent = apiName;
            }
            // 如果当前成员已显示，则递归显示所有父成员
            const show = !!match;
            let forceShow = false;
            for (let parent = item; parent = parent.parentNode.closest(".doc-api");) {
                // 如果任一父成员已筛选，则子元素强制显示
                if (parent.getAttribute("data-doc-filter") === "true") {
                    forceShow = true;
                    break;
                }
                // 如果任一子成员已筛选，则强制显示父元素
                if (show) {
                    parent.setAttribute("data-doc-filter", "child");
                }
            }
            // 标记当前节点已筛选
            item.setAttribute("data-doc-filter", forceShow || show ? "true" : "false");
        }
        for (const item of api.querySelectorAll("[data-doc-filter]")) {
            slideToggle(item, item.getAttribute("data-doc-filter") !== "false");
        }
    }
    DOC.handleMemberFilter = handleMemberFilter;
    /**
     * 切换所有成员折叠模式
     * @param elem 点击的元素
     */
    function toggleMembersCollapse(elem) {
        const api = elem.closest(".doc-api-section");
        const collapsed = !api.querySelector(".doc-api.doc-collapsed");
        for (const item of api.querySelectorAll(".doc-api")) {
            toggleCollapse(item, collapsed);
        }
        for (const item of api.querySelectorAll("details")) {
            item.open = !collapsed;
        }
    }
    DOC.toggleMembersCollapse = toggleMembersCollapse;
    /**
     * 处理成员点击事件
     * @param e 事件对象
     */
    function handleMemberClick(e) {
        const apiItemHeader = e.target.closest(".doc-api-header");
        if (!apiItemHeader) {
            return;
        }
        const apiItem = apiItemHeader.parentNode;
        if (!apiItem.classList.contains("doc-collapsed")) {
            if (e.target.closest("a,button,input,select,textarea,summary,pre,code:not(.doc-api-name),.doc-tab-header>ul>li")) {
                return;
            }
            const selectionText = document.getSelection().toString().trim();
            if (selectionText) {
                return;
            }
        }
        toggleCollapse(apiItem);
    }
    DOC.handleMemberClick = handleMemberClick;
    /**
     * 显示详细信息
     * @param elem 省略号
     */
    function showMoreDetails(elem) {
        elem.innerHTML = elem.querySelector(".doc-more-details").innerHTML;
        elem.classList.remove("doc-more");
        elem.onclick = null;
    }
    DOC.showMoreDetails = showMoreDetails;
    /**
     * 切换选项卡
     * @param elem 点击的元素
     */
    function toggleTab(elem) {
        var _a, _b, _c;
        const li = elem.closest(".doc-tab-header > ul > li");
        if (!li) {
            return;
        }
        const ul = li.parentNode;
        const body = ul.parentNode.nextElementSibling;
        let index = 0;
        for (let node = li; node = node.previousElementSibling;) {
            index++;
        }
        (_a = ul.getElementsByClassName("doc-selected")[0]) === null || _a === void 0 ? void 0 : _a.classList.remove("doc-selected");
        li.classList.add("doc-selected");
        (_b = body.getElementsByClassName("doc-selected")[0]) === null || _b === void 0 ? void 0 : _b.classList.remove("doc-selected");
        (_c = body.children[index]) === null || _c === void 0 ? void 0 : _c.classList.add("doc-selected");
    }
    DOC.toggleTab = toggleTab;
    /**
     * 查找图片详情
     * @param elem 要显示的图片
     */
    function viewImage(elem) {
        const maxWidth = document.documentElement.clientWidth * .8;
        const maxHeight = document.documentElement.clientHeight * .8;
        showImageView("doc-view-image", `<img src="${elem.src}" ${elem.height * maxWidth / elem.width < maxHeight ? `width="${maxWidth}"` : `height="${maxHeight}"`} draggable="false" alt="图片无法加载">`, "");
    }
    DOC.viewImage = viewImage;
    /**
     * 显示图片查看器
     * @param content 内容
     * @param title 标题
     */
    function showImageView(className, content, title) {
        const div = document.body.appendChild(document.createElement("div"));
        div.className = `doc-section doc-imageview ${className}`;
        div.innerHTML = `<div class="doc-imageview-container">
			<div class="doc-imageview-content">
				${content}
			</div>
			${title}
		</div>`;
        div.onclick = e => {
            if (e.target.closest(".doc-imageview-content,.doc-imageview-title")) {
                return;
            }
            if (document.activeElement && document.activeElement.closest(".doc-imageview-content,.doc-imageview-title")) {
                return;
            }
            document.body.removeChild(div);
            document.body.classList.remove("doc-mask");
        };
        div.ondblclick = e => {
            if (e.target.closest(".doc-imageview-title")) {
                return;
            }
            document.body.removeChild(div);
            document.body.classList.remove("doc-mask");
        };
        div.onwheel = e => {
            e.preventDefault();
            const image = div.querySelector("img");
            image.width = Math.max(image.width + (e.deltaY < 0 ? 20 : -20), 5);
            image.style.height = "auto";
        };
        document.body.classList.add("doc-mask");
        return div;
    }
    DOC.showImageView = showImageView;
    /**
     * 切换展开所有示例源码
     * @param elem 菜单元素
     */
    function handleToggleDemoCodeClick(elem) {
        const open = !!document.querySelector(".doc-demo>details:not([open])");
        for (const details of document.querySelectorAll(".doc-demo>details")) {
            details.open = open;
        }
        hideMenu(elem);
    }
    DOC.handleToggleDemoCodeClick = handleToggleDemoCodeClick;
    /**
     * 切换展开所有示例源码
     * @param elem 菜单元素
     */
    function handleToggleDevMode(elem) {
        document.documentElement.classList.toggle("doc-page-dev");
        hideMenu(elem);
    }
    DOC.handleToggleDevMode = handleToggleDevMode;
    /**
     * 显示页面二维码
     * @param elem 菜单元素
     */
    function handleQRCodeClick(elem) {
        showQRCode(location.href);
        hideMenu(elem);
    }
    DOC.handleQRCodeClick = handleQRCodeClick;
    /** 关闭所在菜单 */
    function hideMenu(elem) {
        const menu = elem.closest(".doc-menu");
        menu.style.display = "none";
        setTimeout(() => {
            menu.style.display = "";
        }, 150);
    }
    /**
     * 显示页面二维码
     * @param url 显示的地址
     */
    async function showQRCode(url) {
        const div = showImageView("doc-qrcode", `<span class="doc-spinner"></span>`, `<input type="url" class="doc-imageview-title" readonly size="10" spellcheck="false" oninput="DOC.updateQRCode()" />`);
        if (/^(https?:)?\/\/(localhost|172\.0\.0\.1|::1)(:|\/|$)/.test(url)) {
            const host = await (await fetch("/tdk/api/remoteHost")).text();
            url = url.replace(/^(https?:)?\/\/(localhost|172\.0\.0\.1|::1)(:|\/|$)/, `$1//${host}$3`);
        }
        const input = div.querySelector(".doc-imageview-title");
        input.value = url;
        input.readOnly = false;
        updateQRCode();
    }
    DOC.showQRCode = showQRCode;
    /** 更新二维码 */
    function updateQRCode() {
        const input = document.querySelector(".doc-qrcode .doc-imageview-title");
        if (input) {
            // @ts-ignore
            require(`${DOC.pageData.baseURL}tdk/assets/qrcode.js`, (QRCode) => {
                const qrCode = QRCode(0, "L");
                qrCode.addData(input.value);
                qrCode.make();
                document.querySelector(".doc-qrcode .doc-imageview-content").innerHTML = qrCode.createImgTag(4, 0).replace("<img ", `<img draggable="false"`);
            });
        }
    }
    DOC.updateQRCode = updateQRCode;
    /** 返回顶部 */
    function backToTop() {
        window.scrollTo(0, 0);
    }
    DOC.backToTop = backToTop;
    init();
})(DOC || (DOC = {}));
//# sourceMappingURL=doc.js.map