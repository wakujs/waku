export const StarWaku = () => {
  return (
    <a
      href="https://github.com/wakujs/waku"
      target="_blank"
      rel="noreferrer"
      className="bg-gray-950/90 inline-flex -rotate-3 transform rounded-xl border border-gray-800 px-6 py-4 transition-colors duration-300 ease-in-out hover:border-secondary"
    >
      <span className="text-shadow font-waku whitespace-nowrap text-center text-xl leading-none text-white sm:text-2xl">
        <img
          key="menu"
          src="https://cdn.candycode.com/waku/shinto-shrine.png"
          alt="Menu"
          className="mr-3 inline-block size-6"
        />
        <span>give us a star on GitHub</span>
      </span>
    </a>
  );
};
