import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { AutoScale, LanguageBanner, LanguageSwitcher, useLanguage } from "react-autolocale";

function Home() {
  return (
    <section>
      <h1>Welcome home</h1>
      <p>Build something amazing</p>
    </section>
  );
}

function About() {
  return (
    <section>
      <h1>About us</h1>
      <p>We make great software</p>
    </section>
  );
}

function Contact({ name }: { name: string }) {
  return (
    <section>
      <h1>Contact us</h1>
      <p>Hello {name}, how can we help?</p>
      <input placeholder="Your email" />
    </section>
  );
}

// Reachable only by typing the URL: no link points here, the build finds it in the router code.
function ThankYou() {
  return (
    <section>
      <h1>Thanks for your order</h1>
    </section>
  );
}

function Shell() {
  const { basePath, language } = useLanguage();
  return (
    <BrowserRouter basename={basePath} key={language}>
      <nav>
        <Link to="/">Home</Link> <Link to="/about">About</Link> <Link to="/contact">Contact</Link>
        <LanguageSwitcher />
      </nav>
      <LanguageBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact name="Ada" />} />
        <Route path="/thank-you" element={<ThankYou />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <AutoScale original="en" languages={["fr", "es"]}>
    <Shell />
  </AutoScale>,
);
