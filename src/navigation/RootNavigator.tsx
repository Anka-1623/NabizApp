import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingConsentScreen from '../screens/OnboardingConsentScreen';
import HomeScreen from '../screens/HomeScreen';
import InterventionScreen from '../screens/InterventionScreen';
import DiaryScreen from '../screens/DiaryScreen';
import DeviceScanScreen from '../screens/DeviceScanScreen';
import { useNabizStore } from '../store/useNabizStore';
import { colors, fonts } from '../theme';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.surface, card: colors.surface2, text: colors.ink },
};

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Intervention: undefined;
  Diary: undefined;
  DeviceScan: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  // App.tsx, DiaryStore.init() bittikten sonra consentGiven'ı senkron dolduruyor — bu component
  // ilk render edildiğinde (diaryReady=true olduktan sonra) doğru değer zaten hazır, bu yüzden
  // burada tekrar async kontrol gerekmiyor. Daha önce rıza verilmişse her açılışta yeniden
  // sorulmasın diye başlangıç ekranı Home'a atlıyor.
  const consentGiven = useNabizStore((s) => s.consentGiven);
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={consentGiven ? 'Home' : 'Onboarding'}
        screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingConsentScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Intervention"
          component={InterventionScreen}
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="Diary"
          component={DiaryScreen}
          options={{
            headerShown: true,
            title: 'Günlük ve nüks-risk paneli',
            headerStyle: { backgroundColor: colors.surface2 },
            headerTintColor: colors.accent,
            headerTitleStyle: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.ink },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="DeviceScan"
          component={DeviceScanScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
