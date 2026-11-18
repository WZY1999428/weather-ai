<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ConversationList from './components/ConversationList.vue'
import ChatPage from './pages/ChatPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { useChatStore } from './stores/chat'
import { useSettingsStore } from './stores/settings'
import { errorMessage } from './services/api'
import type { View } from './types'

const view = ref<View>('chat')
const chat = useChatStore()
const settings = useSettingsStore()

onMounted(async () => {
  try {
    await Promise.all([settings.load(), chat.init()])
  } catch (err) {
    ElMessage.error(`初始化失败：${errorMessage(err)}`)
  }
})
</script>

<template>
  <div class="layout">
    <ConversationList :view="view" @update:view="view = $event" />
    <main class="main">
      <ChatPage v-if="view === 'chat'" @open-settings="view = 'settings'" />
      <SettingsPage v-else @back="view = 'chat'" />
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; height: 100vh; overflow: hidden; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
</style>
