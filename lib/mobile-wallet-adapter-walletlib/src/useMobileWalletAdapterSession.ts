import type {TransactionVersion} from '@solana/web3.js';
import {useEffect} from 'react';
import {
  Linking,
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

import {MWASessionEvent, MWASessionEventType} from './mwaSessionEvents';
import {MWARequest, MWARequestType} from './resolve';

const LINKING_ERROR =
  `The package 'solana-mobile-wallet-adapter-walletlib' doesn't seem to be linked. Make sure: \n\n` +
  '- You rebuilt the app after installing the package\n' +
  '- If you are using Lerna workspaces\n' +
  '  - You have added `@solana-mobile/mobile-wallet-adapter-walletlib` as an explicit dependency, and\n' +
  '  - You have added `@solana-mobile/mobile-wallet-adapter-walletlib` to the `nohoist` section of your package.json\n' +
  '- You are not using Expo managed workflow\n';

const SolanaMobileWalletAdapterWalletLib =
  Platform.OS === 'android' && NativeModules.SolanaMobileWalletAdapterWalletLib
    ? NativeModules.SolanaMobileWalletAdapterWalletLib
    : new Proxy(
        {},
        {
          get() {
            throw new Error(
              Platform.OS !== 'android'
                ? 'The package `solana-mobile-wallet-adapter-walletlib` is only compatible with React Native Android'
                : LINKING_ERROR,
            );
          },
        },
      );

const MOBILE_WALLET_ADAPTER_EVENT_BRIDGE_NAME =
  'MobileWalletAdapterServiceRequestBridge';

export interface MobileWalletAdapterConfig {
  supportsSignAndSendTransactions: boolean;
  maxTransactionsPerSigningRequest: number;
  maxMessagesPerSigningRequest: number;
  supportedTransactionVersions: Array<TransactionVersion>;
  noConnectionWarningTimeoutMs: number;
}

export function useMobileWalletAdapterSession(
  walletName: string,
  config: MobileWalletAdapterConfig,
  handleRequest: (request: MWARequest) => void,
  handleSessionEvent: (sessionEvent: MWASessionEvent) => void,
) {
  // Start native event listeners
  useEffect(() => {
    const mwaEventEmitter = new NativeEventEmitter();
    const listener = mwaEventEmitter.addListener(
      MOBILE_WALLET_ADAPTER_EVENT_BRIDGE_NAME,
      nativeEvent => {
        if (isMWARequest(nativeEvent)) {
          handleRequest(nativeEvent as MWARequest);
        } else if (isMWASessionEvent(nativeEvent)) {
          handleSessionEvent(nativeEvent as MWASessionEvent);
        } else {
          console.warn('Unexpected native event type');
        }
      },
    );

    return () => {
      listener.remove();
    };
  }, []);

  initializeScenario(walletName, config);
}

async function initializeScenario(
  walletName: string,
  walletConfig: MobileWalletAdapterConfig,
) {
  // Get initial URL
  const initialUrl = await Linking.getInitialURL();

  // Create Scenario and establish session with dapp
  SolanaMobileWalletAdapterWalletLib.createScenario(
    walletName,
    initialUrl,
    JSON.stringify(walletConfig),
  );
}

function isMWARequest(nativeEvent: any): boolean {
  return Object.values(MWARequestType).includes(nativeEvent.__type);
}

function isMWASessionEvent(nativeEvent: any) {
  return Object.values(MWASessionEventType).includes(nativeEvent.__type);
}
