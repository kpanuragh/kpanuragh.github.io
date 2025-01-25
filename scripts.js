document.addEventListener("DOMContentLoaded", function() {
	const bootMessages = [
		"Found 0x55aa...",
		"Loading kernel...",
		"Initializing drivers...",
		"Mounting filesystems...",
		"Configuring network interfaces...",
		"Setting up user environment...",
		"Starting services...",
		"Loading user profiles...",
		"Boot complete!"
	];

	const logMessages = [
		"[kernel] Initializing system hardware...",
		"[systemd] Mounting root file system...",
		"[network] Detecting network interfaces...",
		"[syslog] Starting logging daemon...",
		"[auth] Loading authentication modules...",
		"[init] Configuring environment variables...",
		"[app] Starting application services...",
		"[user] Welcome, user!"
	];

	let bootIndex = 0;
	const messageElement = document.querySelector('.boot-animation p');
	const logContainer = document.querySelector('.log-container');

	function getRandomDelay(min, max) {
		return Math.random() * (max - min) + min;
	}

	function updateBootMessage() {
		if (bootIndex < bootMessages.length) {
			messageElement.textContent = bootMessages[bootIndex];

			const logMsgElement = document.createElement('div');
			logMsgElement.classList.add('log-message');

			if (bootIndex < logMessages.length) {
				logMsgElement.textContent = logMessages[bootIndex];
			} else {
				const randomLogIndex = Math.floor(Math.random() * logMessages.length);
				logMsgElement.textContent = logMessages[randomLogIndex];
			}

			logContainer.appendChild(logMsgElement);

			setTimeout(() => {
				logMsgElement.style.transform = 'translateY(-200%)';
			}, 4000);

			bootIndex++;

			const delay = getRandomDelay(800, 1500);
			setTimeout(updateBootMessage, delay);
		} else {
			setTimeout(() => {
				document.querySelector('.boot-animation').style.display = 'none';
				logContainer.style.display = 'none';
				document.querySelector('.container').style.display = "block";
			}, 2000);
		}
	}

	updateBootMessage();
});
