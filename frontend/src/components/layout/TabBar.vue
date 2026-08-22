<template>
  <div class="tabs" id="tabBar" @dragover.prevent>
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: route.name === tab.id }"
      draggable="true"
      :data-tab="tab.id"
      @click="switchTab(tab.id)"
      @dragstart="onDragStart"
      @dragover.prevent
      @drop="onDrop"
      @dragend="dragIndex = null"
    >
      {{ tab.label }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({ tabs: { type: Array, required: true } })
const route = useRoute()
const router = useRouter()
const dragIndex = ref(null)

const TAB_ORDER_KEY = 'noc_tab_order'

function switchTab(id) {
  if (route.name !== id) router.push('/' + id)
}

function onDragStart(e) {
  const el = e.currentTarget
  dragIndex.value = props.tabs.findIndex(t => t.id === el.dataset.tab)
  e.dataTransfer.effectAllowed = 'move'
}

function onDrop(e) {
  e.preventDefault()
  const el = e.currentTarget
  const targetId = el.dataset.tab
  const targetIdx = props.tabs.findIndex(t => t.id === targetId)
  if (dragIndex.value === null || dragIndex.value === targetIdx) return
  const order = props.tabs.map(t => t.id)
  const [moved] = order.splice(dragIndex.value, 1)
  order.splice(targetIdx, 0, moved)
  try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)) } catch (_) {}
  dragIndex.value = null
  window.dispatchEvent(new CustomEvent('noc-tab-order-changed'))
}
</script>
