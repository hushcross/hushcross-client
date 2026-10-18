/** Current client behavior, not a promise about third-party retention or business policies. */
export const privacyMessages = {
  privacyNotice: {
    title: 'Privacy and data use',
    subtitle: 'What stays on your device, what leaves it, and where privacy has limits.',
    link: 'Privacy and data use',
    backToApp: 'Open HushCross',
    liveBuild: 'This build connects to BNB Chain. Transactions can use real funds; connection status is not a safety assessment.',
    licenseScope: 'These entries describe individual components, not a single license for the whole project. The local snarkjs prover is GPL-3.0; WalletConnect Universal Provider is Apache-2.0. See the corresponding source and license notices for their terms.',
    sections: {
      scope: {
        title: 'This notice',
        p1: 'This page describes the current HushCross website, installable web app, and browser-extension implementation. Features and data flows depend on the build and the actions you choose. A demonstration build uses simulated data; a chain-connected build can submit real transactions.',
        p2: 'You can read this page without creating, unlocking, or connecting a wallet. Installing the app or extension does not make transactions anonymous and does not back up your account.',
      },
      local: {
        title: 'Your local account',
        p1: 'Your recovery phrase and account keys are created or imported on your device. The account vault is encrypted locally with your password, or with Passkey protection where supported. Only the encrypted vault is persisted; decrypted account secrets are held in memory while unlocked. The client does not send your recovery phrase, vault password, or private keys to HushCross services.',
        p2: 'The first extension release supports password protection, not Passkey protection. Extension storage is separate from website storage; installing either does not migrate or synchronize the other. Local preferences such as language and theme are also stored on the device.',
        p3: 'Encrypting local storage does not protect an unlocked session from a compromised device or malicious software. Keep your recovery phrase and encrypted backup in a safe place; do not rely on browser or system backups as your recovery plan.',
      },
      proofs: {
        title: 'Proofs run on your device',
        p1: 'Zero-knowledge proofs are generated and verified locally using the supplied prover and circuit artifacts. Private proof inputs are not sent to a remote proving service. Proofs and their public inputs may then be sent to a relay or a blockchain transaction.',
        p2: 'Proofs hide the direct cryptographic link between a withdrawal and its originating deposit within the approved set. Amounts, timing, recipients, address reuse, a small anonymity set, and network metadata may still allow observers to correlate activity.',
      },
      network: {
        title: 'Network requests and public records',
        p1: 'The RPC provider, deposit-screening service, transaction relay, indexer, and metadata host can receive your IP address and connection metadata when contacted. Depending on the request, they also receive queried public addresses, commitments, public proof inputs, transaction data, identifiers, or public profile content. Not every service receives every field.',
        p2: 'A relay can see the recipient and transaction it is asked to submit. Public blockchain records include transaction contents, amounts, addresses, and timing. Reading public data through a service also reveals which records your client requested to that service.',
        p3: 'The current client contains no application advertising or analytics tracking. WalletConnect SDK telemetry is disabled. This does not mean hosting providers, RPC endpoints, relays, external wallets, or other suppliers keep no operational logs.',
      },
      links: {
        title: 'Gift links and delegated reveal',
        p1: 'A gift secret stays in the URL fragment after #, rather than the URL query. The client does not proactively upload the gift secret to HushCross services. Anyone with the complete link may be able to claim the gift: treat it as a bearer secret. A messaging app, clipboard tool, browser history, or anyone you share it with may keep a copy.',
        p2: 'When you choose delegated reveal, the reveal preimage is encrypted for transmission to the relay, but that relay can decrypt it before the public reveal. Encryption in transit does not keep that order information secret from the relay. Market, side, and committed amount can already be public before reveal.',
      },
      walletConnect: {
        title: 'Optional external-wallet connection',
        p1: 'WalletConnect Universal Provider 2.21.8 is loaded and connects to its official relay only after you choose WalletConnect. The provider can observe network and connection metadata. Its Verify service uses a separate iframe that receives the app origin, project ID, and message hashes; it is not the local wallet vault.',
        p2: 'The current client stores its WalletConnect session in memory, not persistent browser storage. Reloading requires a new connection. Your external wallet and WalletConnect providers may retain their own records; this client does not control those records.',
        p3: 'Transaction and signing requests still require confirmation in your external wallet. Connecting does not hand HushCross the private keys of that wallet. Review the network, recipient, amount, and requested permissions in the wallet before approving.',
      },
      control: {
        title: 'Your choices and deletion',
        p1: 'You can decline WalletConnect, disconnect an external wallet, lock your local account, and choose which links or transactions to share. These actions do not undo transactions or erase data already received by other parties.',
        p2: 'Before forgetting an account, clearing browser or extension data, or uninstalling, save your recovery phrase and encrypted backup and verify that you can restore them. Removing local data can remove the only available copy of notes and pending-operation information. It is not a withdrawal and does not cancel pending chain actions.',
        p3: 'Public blockchain records cannot be deleted by HushCross. Retention periods for third-party operational logs are not established by this client; consult the relevant provider. No fixed retention or deletion deadline is promised here.',
      },
      limits: {
        title: 'Trust and safety limits',
        p1: 'HushCross has not undergone an independent security audit. Local tests and working transactions are not an audit or a guarantee of safety. Smart-contract bugs, compromised clients, unavailable services, and malicious counterparties can cause loss.',
        p2: 'Contract-owner powers, including upgrade powers where present, and root decisions made by the approved-set provider are trust dependencies. Administrators and services may affect availability, eligibility, or contract behavior. Some contract-created redeposit notes have no emergency exit that bypasses screening.',
      },
      contact: {
        title: 'Questions or implementation concerns',
        p1: 'Use the official GitHub issue tracker or HushCross X account for public questions. Do not post a recovery phrase, private key, password, gift secret, pairing URI, unredacted backup, or other sensitive material in an issue or message. These are public contact channels, not account recovery services.',
        issues: 'Official GitHub issues',
        x: 'HushCross on X',
        website: 'Official website', email: 'Email support',
      },
    },
  },
};
