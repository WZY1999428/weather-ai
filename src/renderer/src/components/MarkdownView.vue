<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { ElMessage } from 'element-plus'

const props = defineProps<{ content: string }>()

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const md: MarkdownIt = new MarkdownIt({ html: false, linkify: true, breaks: true })
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = token.info.trim().split(/\s+/)[0] ?? ''
  let code: string
  try {
    code = lang && hljs.getLanguage(lang) ? hljs.highlight(token.content, { language: lang }).value : escape(token.content)
  } catch {
    code = escape(token.content)
  }
  return `<div class="code-block"><div class="code-block-header"><span>${escape(lang || 'text')}</span><button class="code-copy" type="button">复制</button></div><pre><code class="hljs">${code}</code></pre></div>`
}
const defaultLink = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLink(tokens, idx, options, env, self)
}

const html = computed(() => md.render(props.content || ''))

async function onClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement
  if (!target.classList.contains('code-copy')) return
  const code = target.closest('.code-block')?.querySelector('code')?.textContent ?? ''
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success('代码已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <!-- markdown-it 已禁用原始 HTML，输出为安全的转义内容 -->
  <div class="markdown-body" @click="onClick" v-html="html"></div>
</template>
