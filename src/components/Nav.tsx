import { Link } from "react-router-dom";

export function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="brand">
        AI Usage Analyzer
      </Link>
    </nav>
  );
}
