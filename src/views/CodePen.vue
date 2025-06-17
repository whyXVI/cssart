<template>
  <router-view />
</template>

<script setup lang="ts"></script>
<style lang=scss scoped>

@at-root {
    html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow-x: hidden;
    }

    #app {
        width: 100%;
        height: 100%;
    }
}
</style>