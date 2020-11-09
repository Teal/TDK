import { encodeHTML } from "tutils/html";
import { getName } from "tutils/path";
import { parseSVGSprite } from "../shared/svgSprite";
export default function (content, path) {
    const icons = parseSVGSprite(content);
    const keys = Object.keys(icons);
    const name = getName(path, false);
    if (!keys.length) {
        icons[name] = content;
        keys.push(name);
    }
    const page = `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>${name}</title>
	<style>
		.iconviewer {
			padding: 1.5rem 1rem;
		}
		.iconviewer-container {
			margin: 0 auto;
			padding: 0;
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
			color: #314659;
			font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Segoe UI", Roboto, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
			font-weight: normal;
			font-size: .95rem;
			line-height: 1.5;
		}
		.iconviewer-container li {
			margin: 0 0 1rem;
			list-style: none;
			text-align: center;
			padding: .25rem 0;
			border: 1px solid transparent;
			border-radius: 4px;
			cursor: pointer;
			word-break: break-word;
			transition: background-color .2s;
		}
		.iconviewer-container li:hover {
			background-color: #f2f3f4;
		}
		.iconviewer-container svg {
			display: inline-block;
			margin: .25rem 0;
			width: 1.75rem;
			height: 1.75rem;
			font-size: 1.75rem;
			font-style: normal;
			user-select: text;
			line-height: 2;
			fill: currentColor;
		}
	</style>
</head>
<body>
<div class="iconviewer">
	<ul class="iconviewer-container">
		${keys.map(icon => `<li onclick="iconViewerCopy(this)" title="Copy “${icon}”">
			${icons[icon]}
			<div>${encodeHTML(icon)}</div>
		</li>`).join("\n")}
	</ul>
	<script>
		function iconViewerCopy(elem) {
			var text = elem.getElementsByTagName("div")[0].textContent
			copyText(text, function (success) {
				if (success) {
					showTip("Copied“" + text + "”", '<span style="color: #00796b">✔</span> ', 2000)
				} else {
					showTip("Please copy manually: “" + text + "”", '<span style="color: #d50000">✘</span> ', 4000)
				}
			})
			function copyText(text, callback, useCommand) {
				if (navigator.clipboard && !useCommand) {
					return navigator.clipboard.writeText(text).then(function (){ callback(true) }, function (){ copyText(text, callback, true) })
				}
				var textArea = document.body.appendChild(document.createElement("textarea"))
				textArea.value = text
				try {
					if (/ipad|iphone/i.test(navigator.userAgent)) {
						var range = document.createRange()
						range.selectNodeContents(textArea)
						var selection = window.getSelection()
						selection.removeAllRanges()
						selection.addRange(range)
						textArea.setSelectionRange(0, 999999)
					} else {
						textArea.select()
					}
					callback(document.execCommand("Copy"))
				} catch (err) {
					callback(false)
				} finally {
					document.body.removeChild(textArea)
				}
			}
			function showTip(text, icon, timeout) {
				var tip = showTip.elem = document.body.appendChild(document.createElement("div"))
				tip.textContent = text
				tip.innerHTML = icon + tip.innerHTML
				tip.style = "position: fixed; left: 50%; transform: translate(-50%, -6em); z-index: 65530; top: 2em; opacity: 1; background: #fff; border-radius: 4px; padding: .5em 1em; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); line-height: 2; transition: transform .3s;"
				tip.offsetParent
				tip.style.transform = "translate(-50%, 0)"
				setTimeout(function () {
					var tip = showTip.elem
					tip.style.transform = "translate(-50%, -6em)"
					setTimeout(function () {
						document.body.removeChild(tip)
					}, 400)
				}, timeout)
			}
		}
	</script>
</div>
</body>
</html>`;
    return {
        content: page
    };
}
//# sourceMappingURL=svgViewer.js.map