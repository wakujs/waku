const AboutPage = ({ locale }: { locale: string[] }) => (
  <div>
    <h1>About</h1>
    <p data-testid="locale">{locale.join('/')}</p>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

export default AboutPage;
