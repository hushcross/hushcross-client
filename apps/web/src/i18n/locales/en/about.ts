/** "How it works and risks": plain statements of what HushCross does and does not do. */
export const aboutMessages = {
  about: {
    title: 'How it works and risks',
    subtitle: 'Please read this before you put money in.',
    link: 'How it works and risks',
    linkBody: 'What stays private, the fees, and what you are responsible for.',
    sections: {
      what: {
        title: 'What HushCross is',
        p1: 'HushCross is a web app and browser-extension client that talk to smart contracts on BNB Chain. The vault is built on Privacy Pools, an open-source shared pool that uses zero-knowledge proofs.',
        p2: 'Your account keys are created and encrypted on your device; the client does not send them to HushCross servers. This does not remove smart-contract or administrator risk. HushCross cannot restore a lost recovery phrase for you.',
      },
      privacy: {
        title: 'What stays private, and what does not',
        p1: 'Zero-knowledge proofs hide the direct cryptographic link between a withdrawal and its originating deposit within the approved set. Network metadata, amounts, timing, address reuse, and a small anonymity set may still let observers correlate them.',
        p2: 'Some things are always public: deposits from a public wallet, withdrawals to a public address, amounts, and times. Sending the same unusual amount right after depositing it can make the two easy to connect, which is why the app splits amounts into standard sizes and suggests waiting.',
        p3: 'The relay that sends transactions for you sees your network address when you use it, like any website. It does not get your keys.',
        p4: 'Deposits are checked against a public sanctions list before they can be used privately. Deposits from listed addresses are refused.',
      },
      fees: {
        title: 'Fees',
        vault: 'Depositing into the vault: 0.3% check fee.',
        relay: 'Relay fee for sending on your behalf: shown before you confirm, at most 1.5%.',
        launch: 'Sealed-bid launches: 1% of the amount raised, paid by the project.',
        book: 'Dark pool: 0.05% of what trades, on each side.',
        give: 'Giving: no platform fee, only the relay fee.',
      },
      risks: {
        title: 'Risks',
        p1: 'HushCross has not undergone an independent security audit. Tests are not an audit. Smart contracts and zero-knowledge systems can contain unknown flaws, and on-chain transactions cannot be reversed.',
        p2: 'If you lose your recovery phrase and your passkey or password, nobody can restore your account or your funds. Back up the phrase and keep it offline.',
        p3: 'Tokens from launches and trades can lose most or all of their value. Nothing in HushCross is investment advice.',
        p4: 'Funds that HushCross contracts put back into the vault for you (gift notes, and unused funds from launches, trades and goals) can be withdrawn only after the deposit check approves them. Unlike a deposit from your own wallet, they have no emergency exit that skips the check: if the check service stops or never approves them, they stay in the vault.',
        p5: 'Contract-owner powers, including upgrade powers where present, and approved-set root decisions are trust dependencies. They can affect contract behavior or access to funds; local key custody does not remove these risks.',
      },
      you: {
        title: 'Your responsibilities',
        p1: 'You are responsible for following the laws where you live, including on taxes and on privacy tools.',
        p2: 'Do not use HushCross with funds from crime or for sanctioned people or places.',
        p3: 'This page may be updated as the app changes.',
      },
    },
  },
};
