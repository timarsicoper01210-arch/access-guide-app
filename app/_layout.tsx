import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="navigate" />
      <Stack.Screen name="obstacles" />
      <Stack.Screen name="describe" />
      <Stack.Screen name="permissions-needed" />
    </Stack>
  );
}
