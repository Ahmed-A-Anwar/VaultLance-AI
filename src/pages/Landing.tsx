import { Hero } from "../components/Hero";

export default function Landing() {
  /* Hero already owns the page's main landmark. Wrapping it in another main
     produced nested main elements and two id="main" targets. */
  return <Hero />;
}
