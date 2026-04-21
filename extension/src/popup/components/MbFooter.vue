<template>
  <footer class="flex items-center justify-between text-xs mt-3">
    <Cog6ToothIcon class="size-4 hover:cursor-pointer" @click="openOptionsPage"></Cog6ToothIcon>
    <InformationCircleIcon
      class="size-4 hover:cursor-pointer"
      @click="openInfoPage"
    ></InformationCircleIcon>
  </footer>
</template>

<script setup lang="ts">
import InformationCircleIcon from "@heroicons/vue/16/solid/InformationCircleIcon"
import Cog6ToothIcon from "@heroicons/vue/16/solid/Cog6ToothIcon"
import useNavigation from "../composables/useNavigation"

const { openInfoPage, openOptionsPage } = useNavigation()
</script>
