// FIXME this is a hack for now

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*?url' {
  const src: string;
  export default src;
}
