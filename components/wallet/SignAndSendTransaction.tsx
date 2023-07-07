import {useState, useEffect} from 'react';
import {
  MWARequestFailReason,
  SignAndSendTransactionsRequest,
  resolve,
} from '../../lib/mobile-wallet-adapter-walletlib/src';
import {useClientTrust} from '../provider/ClientTrustUseCaseProvider';
import {useWallet} from '../provider/WalletProvider';
import {Dimensions, StyleSheet, View} from 'react-native';
import {Divider, Text} from 'react-native-paper';
import {Keypair} from '@solana/web3.js';
import SignUseCase from '../../utils/SignUseCase';
import SendTranscationUseCase, {
  SendTransactionsError,
} from '../../utils/SendUseCase';
import AppInfo from './AppInfo';
import Loader from '../Loader';
import {
  VerificationState,
  verificationStatusText,
} from '../../utils/ClientTrustUseCase';
import {getIconFromIdentityUri} from '../../utils/dapp';
import ButtonGroup from './ButtonGroup';

const styles = StyleSheet.create({
  icon: {height: 75, width: 75, marginTop: 16},
  header: {
    width: Dimensions.get('window').width,
    color: 'black',
    textAlign: 'center',
    fontSize: 24,
    marginVertical: 16,
  },
  info: {color: 'black', textAlign: 'left'},
  divider: {
    marginVertical: 8,
    width: Dimensions.get('window').width,
    height: 1,
  },
  root: {
    display: 'flex',
    width: Dimensions.get('window').width,
    height: 'auto',
    alignItems: 'center',
  },

  metadata: {
    display: 'flex',
    width: Dimensions.get('window').width,
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  content: {
    textAlign: 'left',
    color: 'green',
    fontSize: 18,
  },
});

const signAndSendTransaction = async (
  wallet: Keypair,
  request: SignAndSendTransactionsRequest,
  onFinish: () => void,
) => {
  const valid = request.payloads.map(_ => true);
  let signedTsxs = request.payloads.map((payload, index) => {
    try {
      return SignUseCase.signTransaction(new Uint8Array(payload), wallet);
    } catch (e) {
      console.log('sign error: ' + e);
      valid[index] = false;
      return new Uint8Array([]);
    }
  });

  if (valid.includes(false)) {
    resolve(request, {
      failReason: MWARequestFailReason.InvalidSignatures,
      valid,
    });
    return;
  }

  try {
    const sigs = await SendTranscationUseCase.sendTransactions(
      signedTsxs,
      request.minContextSlot ? request.minContextSlot : undefined,
    );
    resolve(request, {signedTransactions: sigs});
    onFinish();
  } catch (e) {
    console.log('Send error: ' + e);
    if (e instanceof SendTransactionsError) {
      resolve(request, {
        failReason: MWARequestFailReason.InvalidSignatures,
        valid: e.valid,
      });
    } else {
      throw e;
    }
  }
};

interface SignAndSendTransactionProps {
  request: SignAndSendTransactionsRequest;
}

const SignAndSendTransaction = ({request}: SignAndSendTransactionProps) => {
  const {wallet} = useWallet();
  const {clientTrustUseCase} = useClientTrust();
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationState, setVerificationState] = useState<
    VerificationState | undefined
  >(undefined);

  if (!wallet) {
    throw new Error('Wallet is null or undefined');
  }

  useEffect(() => {
    const verifyClient = async () => {
      const authScope = new TextDecoder().decode(request.authorizationScope);
      const verificationState =
        await clientTrustUseCase?.verifyAuthorizationSource(
          request.appIdentity?.identityUri,
        );
      setVerificationState(verificationState);

      const verified =
        (await clientTrustUseCase?.verifyPrivaledgedMethodSource(
          authScope,
          request.appIdentity?.identityUri,
        )) ?? false;

      setVerified(verified);

      if (!verified) {
        resolve(request, {
          failReason: MWARequestFailReason.UserDeclined,
        });
      }
    };

    verifyClient();
  }, []);

  return (
    <View style={styles.root}>
      {loading && <Loader loadingText="Signing and sending..." />}
      <AppInfo
        iconSource={getIconFromIdentityUri(request.appIdentity)}
        title="Authorize Dapp"
        appName={request.appIdentity?.identityName}
        uri={request.appIdentity?.identityUri}
        cluster={request.cluster}
        verificationText={verificationStatusText(verificationState)}
        scope={verificationState?.authorizationScope}
        needDivider
      />
      <Text style={styles.header}>Payloads</Text>
      <Text style={styles.content}>
        This request has {request.payloads.length}{' '}
        {request.payloads.length > 1 ? 'payloads' : 'payload'} to sign.
      </Text>
      <Divider style={styles.divider} />
      <ButtonGroup
        positiveButtonText="Sign and Send"
        negativeButtonText="Reject"
        positiveOnClick={() => {
          setLoading(true);
          signAndSendTransaction(wallet as Keypair, request, () => {
            setLoading(false);
          });
        }}
        negativeOnClick={() => {
          resolve(request, {failReason: MWARequestFailReason.UserDeclined});
        }}
      />
    </View>
  );
};

export default SignAndSendTransaction;
