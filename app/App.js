import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DrawerActions } from '@react-navigation/native';
import { initSentry, navigationIntegration } from './src/services/sentry';

// Initialise Sentry as the very first thing on import so native crashes and
// any throw during provider setup are captured. initSentry is a no-op when no
// DSN is configured, so this is safe to leave in for dev builds too.
initSentry();

// Anonymous product telemetry — init early, then record the cold-launch event.
import { initTelemetry, track } from './src/services/telemetry';
initTelemetry().then(() => track('app_opened')).catch(() => {});

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons as Icon } from '@expo/vector-icons';
import CaptureScreen from './src/screens/CaptureScreen';
import ResultScreen from './src/screens/ResultScreen';
import SafetyScreen from './src/screens/SafetyScreen';
import ProjDet from './src/screens/ProjDet';
import WorkSteps from './src/screens/WorkSteps';
import HoneyDo from './src/screens/HoneyDo';
import Contractors from './src/screens/Contractors';
import Settings from './src/screens/Settings';
import Inventory from './src/screens/Inventory';
import ShoppingList from './src/screens/ShoppingList';
import Emergency from './src/screens/Emergency';
import Diagnose from './src/screens/Diagnose';
import WholeHouse from './src/screens/WholeHouseScreen';
import WholeHouseResult from './src/screens/WholeHouseResultScreen';
import Shrubbery from './src/screens/ShrubberyScreen';
import ShrubberyResult from './src/screens/ShrubberyResultScreen';
import Quotes from './src/screens/Quotes';
import Community from './src/screens/Community';
import DeleteAccount from './src/screens/DeleteAccountScreen';
import ScreenErrorBoundary from './src/components/ScreenErrorBoundary';
import theme from './src/theme';
import { I18nProvider, useTranslation } from './src/i18n/I18nContext';
import { ThemeProvider } from './src/ThemeContext';
import { requestCaptureReset } from './src/utils/captureBus';

// Helper used by both the logo header and the "New Project" drawer item.
// Asks the Capture screen to reset (it decides whether to prompt) and pops
// the capture stack back to the root so we always land on the main screen.
const goToFreshCapture = (navigation) => {
  requestCaptureReset();
  navigation.navigate('NewProject', { screen: 'Capture' });
};

const LogoHeader = ({ onPress, title, subtitle }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}
  >
    <Image
      source={require('./assets/logo.png')}
      style={{ width: 48, height: 48, borderRadius: 12, resizeMode: 'cover' }}
    />
    <View style={{ marginLeft: 12 }}>
      <Text style={{
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: -0.5
      }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{
          fontSize: 11,
          color: '#94A3B8', // slate-400
          fontWeight: '500'
        }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  </TouchableOpacity>
);

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

// Per-screen wrappers so an unhandled render error in one screen renders the
// boundary's "Try again" fallback instead of red-boxing the whole app. Each
// boundary resets its `error` state on navigation focus so going Back +
// returning re-attempts the render.
const withBoundary = (Component, screenName) => (props) =>
  React.createElement(
    ScreenErrorBoundary,
    { screenName },
    React.createElement(Component, props),
  );

const CaptureWithBoundary       = withBoundary(CaptureScreen,        'CaptureScreen');
const ResultWithBoundary        = withBoundary(ResultScreen,         'ResultScreen');
const SafetyWithBoundary        = withBoundary(SafetyScreen,         'SafetyScreen');
const ProjDetWithBoundary       = withBoundary(ProjDet,              'ProjDet');
const WorkStepsWithBoundary     = withBoundary(WorkSteps,            'WorkSteps');
const WholeHouseWithBoundary    = withBoundary(WholeHouse,           'WholeHouseScreen');
const WholeHouseResultWithBoundary = withBoundary(WholeHouseResult,  'WholeHouseResultScreen');
const ShrubberyWithBoundary     = withBoundary(Shrubbery,            'ShrubberyScreen');
const ShrubberyResultWithBoundary = withBoundary(ShrubberyResult,    'ShrubberyResultScreen');
const DeleteAccountWithBoundary = withBoundary(DeleteAccount,        'DeleteAccountScreen');
const HoneyDoWithBoundary       = withBoundary(HoneyDo,              'HoneyDo');
const ContractorsWithBoundary   = withBoundary(Contractors,          'Contractors');
const SettingsWithBoundary      = withBoundary(Settings,             'Settings');
const InventoryWithBoundary     = withBoundary(Inventory,            'Inventory');
const ShoppingListWithBoundary  = withBoundary(ShoppingList,         'ShoppingList');
const EmergencyWithBoundary     = withBoundary(Emergency,            'Emergency');
const DiagnoseWithBoundary      = withBoundary(Diagnose,             'Diagnose');
const QuotesWithBoundary        = withBoundary(Quotes,               'Quotes');
const CommunityWithBoundary     = withBoundary(Community,            'Community');

const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.secondary,
  },
};

function CaptureStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      initialRouteName="Capture"
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.text,
          elevation: 0,
          shadowOpacity: 0,
          height: 120,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen
        name="Capture"
        component={CaptureWithBoundary}
        options={({ navigation }) => ({
          headerTitle: () => <LogoHeader onPress={() => goToFreshCapture(navigation)} title={t('app_title')} subtitle={t('app_subtitle')} />,
          headerTitleAlign: 'left',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              style={{ marginRight: 15, padding: 10 }}
            >
              <Icon name="menu" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          ),
          headerLeft: () => null,
        })}
      />
      <Stack.Screen
        name="Result"
        component={ResultWithBoundary}
        options={{ title: t('nav_project_steps') }}
      />
      <Stack.Screen
        name="Safety"
        component={SafetyWithBoundary}
        options={{ title: t('nav_safety_first') }}
      />
      <Stack.Screen
        name="ProjectDetail"
        component={ProjDetWithBoundary}
        options={{ title: t('nav_project_detail') }}
      />
      <Stack.Screen
        name="WorkshopSteps"
        component={WorkStepsWithBoundary}
        options={{ title: t('nav_workshop_mode') }}
      />
      <Stack.Screen
        name="WholeHouse"
        component={WholeHouseWithBoundary}
        options={{ title: 'Whole House Advice' }}
      />
      <Stack.Screen
        name="WholeHouseResult"
        component={WholeHouseResultWithBoundary}
        options={{ title: 'House Suggestions' }}
      />
      <Stack.Screen
        name="Shrubbery"
        component={ShrubberyWithBoundary}
        options={{ title: 'Shrubbery Helper' }}
      />
      <Stack.Screen
        name="ShrubberyResult"
        component={ShrubberyResultWithBoundary}
        options={{ title: 'Shrub Recommendations' }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountWithBoundary}
        options={{ title: 'Delete Account' }}
      />
    </Stack.Navigator>
  );
}

// Mutable ref so Sentry's nav integration can subscribe once the container is
// mounted. Declared at module scope (not via useRef) because the integration
// API expects a plain object reference, not a hook.
let navigationRef = null;

function AppContent() {
  const { t } = useTranslation();
  return (
    <NavigationContainer
      theme={MyTheme}
      onReady={() => {
        try { navigationIntegration?.registerNavigationContainer?.(navigationRef); } catch {}
      }}
      onStateChange={(state) => {
        try {
          const route = state?.routes?.[state.index];
          if (route?.name) {
            track('screen_viewed', { screen: route.name });
          }
        } catch { /* ignore */ }
      }}
      ref={(ref) => { navigationRef = ref; }}
    >
      <Drawer.Navigator
        initialRouteName="NewProject"
        screenOptions={{
          drawerActiveTintColor: theme.colors.primary,
          drawerInactiveTintColor: theme.colors.textSecondary,
          drawerStyle: {
            backgroundColor: theme.colors.surface,
            width: 280,
            borderTopRightRadius: theme.roundness.large,
            borderBottomRightRadius: theme.roundness.large,
          },
          headerShown: false,
          headerStyle: {
            backgroundColor: theme.colors.text,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            height: 120,
          },
          headerTitleStyle: {
            fontWeight: 'bold',
            color: '#FFFFFF',
          },
          headerTintColor: '#FFFFFF',
        }}
      >
        <Drawer.Screen
          name="NewProject"
          component={CaptureStack}
          listeners={({ navigation }) => ({
            drawerItemPress: (e) => {
              // Always fire a reset request when "New Project" is tapped from the drawer.
              // CaptureScreen decides whether to prompt (focused + dirty) or just clear.
              requestCaptureReset();
              // Then ensure we land on the Capture screen at the root of its stack.
              e.preventDefault();
              navigation.navigate('NewProject', { screen: 'Capture' });
              navigation.closeDrawer();
            },
          })}
          options={{
            title: t('nav_new_project'),
            headerShown: false, // Stack has its own header
            drawerIcon: ({ color, size }) => (
              <Icon name="add-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="HoneyDoList"
          component={HoneyDoWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_honey_do_list'),
            headerShown: true,
            headerTitle: () => (
              <LogoHeader
                onPress={() => goToFreshCapture(navigation)}
                title={t('nav_honey_do_list')}
                subtitle={t('app_title')}
              />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => (
              <Icon name="list-outline" size={size} color={color} />
            ),
          })}
        />
        <Drawer.Screen
          name="ContractorList"
          component={ContractorsWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_contractor_list'),
            headerShown: true,
            headerTitle: () => (
              <LogoHeader
                onPress={() => goToFreshCapture(navigation)}
                title={t('nav_contractor_list')}
                subtitle={t('app_title')}
              />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => (
              <Icon name="hammer-outline" size={size} color={color} />
            ),
          })}
        />
        <Drawer.Screen
          name="Inventory"
          component={InventoryWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_inventory') || 'My Tools',
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_inventory') || 'My Tools'} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="construct-outline" size={size} color={color} />,
          })}
        />
        <Drawer.Screen
          name="ShoppingList"
          component={ShoppingListWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_shopping') || 'Shopping List',
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_shopping') || 'Shopping List'} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="cart-outline" size={size} color={color} />,
          })}
        />
        <Drawer.Screen
          name="Diagnose"
          component={DiagnoseWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_diagnose') || "What's Wrong?",
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_diagnose') || "What's Wrong?"} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="search-outline" size={size} color={color} />,
          })}
        />
        <Drawer.Screen
          name="ShrubberyHelper"
          component={ShrubberyWithBoundary}
          listeners={({ navigation }) => ({
            drawerItemPress: (e) => {
              e.preventDefault();
              navigation.navigate('NewProject', { screen: 'Shrubbery' });
              navigation.closeDrawer();
            },
          })}
          options={{
            title: 'Shrubbery Helper',
            headerShown: false,
            drawerIcon: ({ color, size }) => <Icon name="leaf-outline" size={size} color={color} />,
          }}
        />
        <Drawer.Screen
          name="Quotes"
          component={QuotesWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_quotes') || 'Quote Tracker',
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_quotes') || 'Quote Tracker'} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="chatbox-ellipses-outline" size={size} color={color} />,
          })}
        />
        <Drawer.Screen
          name="Community"
          component={CommunityWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_community') || 'Community',
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_community') || 'Community'} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="people-outline" size={size} color={color} />,
          })}
        />
        <Drawer.Screen
          name="Emergency"
          component={EmergencyWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_emergency') || 'Emergency',
            headerShown: true,
            headerTitle: () => (
              <LogoHeader onPress={() => navigation.navigate('NewProject')} title={t('nav_emergency') || 'Emergency'} subtitle={t('app_title')} />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => <Icon name="warning-outline" size={size} color="#DC2626" />,
          })}
        />
        <Drawer.Screen
          name="Settings"
          component={SettingsWithBoundary}
          options={({ navigation }) => ({
            title: t('nav_settings'),
            headerShown: true,
            headerTitle: () => (
              <LogoHeader
                onPress={() => goToFreshCapture(navigation)}
                title={t('nav_settings')}
                subtitle={t('app_title')}
              />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.openDrawer()} style={{ marginRight: 15 }}>
                <Icon name="menu" size={30} color="#FFFFFF" />
              </TouchableOpacity>
            ),
            headerLeft: () => null,
            drawerIcon: ({ color, size }) => (
              <Icon name="settings-outline" size={size} color={color} />
            ),
          })}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <I18nProvider>
          <AppContent />
        </I18nProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
