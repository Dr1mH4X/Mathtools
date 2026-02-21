<script setup lang="ts">
import AppHeader from "@/components/layout/AppHeader.vue";
</script>

<template>
    <div class="min-h-screen h-screen flex flex-col overflow-hidden">
        <AppHeader />
        <main class="flex-1 min-h-0 overflow-hidden">
            <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                    <component :is="Component" />
                </transition>
            </router-view>
        </main>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
