<script setup lang="ts">
// 通用弹窗：遮罩 + 居中卡片，点击遮罩或右上角关闭
defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      @click.self="emit('close')"
    >
      <div class="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button
            class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <div class="px-5 py-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
