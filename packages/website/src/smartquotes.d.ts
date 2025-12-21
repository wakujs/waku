declare module 'smartquotes' {
  interface SmartQuotesInstance {
    listen(): void;
  }
  export default function smartquotes(): SmartQuotesInstance;
}
