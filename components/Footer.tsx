export default function Footer() {
  return (
    <footer className="w-full py-8 mt-16 border-t border-terminal-border dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 text-center text-sm text-terminal-text">
        <p>
          Connect with me on{' '}
          <a
            href="https://www.linkedin.com/in/anuraghkp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-terminal-accent font-medium hover:underline"
          >
            LinkedIn
          </a>
          {' & '}
          <a
            href="https://github.com/kpanuragh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-terminal-accent font-medium hover:underline"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
