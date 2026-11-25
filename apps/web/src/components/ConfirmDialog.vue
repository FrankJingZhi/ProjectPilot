<script setup lang="ts">
// 确认对话框：危险操作二次确认
import AppModal from './AppModal.vue';

defineProps<{ open: boolean; title: string; message: string; loading?: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <AppModal :open="open" :title="title" @close="emit('cancel')">
    <p class="text-sm text-slate-600">{{ message }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button
        class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        class="rounded-lg bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
        :disabled="loading"
        @click="emit('confirm')"
      >
        {{ loading ? '处理中…' : '确认删除' }}
      </button>
    </div>
  </AppModal>
</template>
