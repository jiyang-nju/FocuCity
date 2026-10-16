#!/bin/zsh
# Run from this file's directory, including paths containing spaces or Chinese.
cd -- "${0:A:h}" || exit 1

focucity_node="${FOCUCITY_NODE:-}"
if [[ -z "$focucity_node" ]]; then
  focucity_node="$(command -v node 2>/dev/null)"
fi
if [[ ! -x "$focucity_node" ]]; then
  for focucity_candidate in "/opt/homebrew/bin/node" "/usr/local/bin/node" \
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
    if [[ -x "$focucity_candidate" ]]; then
      focucity_node="$focucity_candidate"
      break
    fi
  done
fi

if [[ ! -x "$focucity_node" ]]; then
  print '未找到 Node.js。请安装 Node.js，或通过 FOCUCITY_NODE 指定它的位置。'
  read 'focucity_reply?按回车关闭窗口…'
  exit 1
fi

exec "$focucity_node" scripts/open-local.mjs "$@"
