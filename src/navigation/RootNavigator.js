import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Home, BarChart3, Settings } from "lucide-react-native";

import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

import LoginScreen from "../screens/LoginScreen";
import SignUpScreen from "../screens/SignUpScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import HomeScreen from "../screens/HomeScreen";
import FoodLoggerScreen from "../screens/FoodLoggerScreen";
import TrendsScreen from "../screens/TrendsScreen";
import SettingsScreen from "../screens/SettingsScreen";

const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: "#C8BFAF",
        tabBarStyle: { borderTopColor: theme.colors.border, height: 60, paddingBottom: 8, paddingTop: 8 },
      }}
    >
      <Tabs.Screen
        name="Today"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Trends"
        component={TrendsScreen}
        options={{ tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="MainTabs" component={MainTabs} />
      <MainStack.Screen
        name="FoodLogger"
        component={FoodLoggerScreen}
        options={{ presentation: "modal" }}
      />
    </MainStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, profile, initializing } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // If Firebase hasn't responded in 10 seconds, show an error instead of
  // spinning forever — most likely cause is missing/wrong Firebase config keys.
  useEffect(() => {
    if (!initializing) return;
    const timer = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [initializing]);

  if (initializing && timedOut) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background, padding: 32 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text, textAlign: "center", marginBottom: 10 }}>
          Unable to connect
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: "center", lineHeight: 20 }}>
          VitalBalance couldn't reach Firebase. Check your internet connection and try again. If the problem persists, the app may have been built without valid Firebase configuration keys.
        </Text>
      </View>
    );
  }

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 14, fontSize: 13, color: theme.colors.textMuted }}>Loading VitalBalance…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? <AuthNavigator /> : !profile?.onboardingComplete ? <OnboardingScreen /> : <MainNavigator />}
    </NavigationContainer>
  );
}
