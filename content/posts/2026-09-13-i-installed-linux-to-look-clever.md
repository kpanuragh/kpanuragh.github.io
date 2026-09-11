---
title: "I installed Linux to look clever"
date: "2026-09-13"
excerpt: "The honest reason I switched wasn't philosophy or performance. I couldn't afford hardware that ran GTA 5, I noticed the people I thought were brilliant all used Linux, and I wanted to look like one of them. Then I deleted my own Windows partition."
tags: ["linux", "personal", "gentoo"]
---

I want to start with the real reason, because the tidy version — freedom, control, the Unix philosophy — came years later and would be a lie if I put it at the front.

I like games. I have always liked games. [The first computer I ever loved](/blog/2026-09-12-i-learned-to-program-on-a-keypad-phone/) was one I loved because somebody installed Road Rash on it.

When I started working I had no money for a laptop, and eventually I bought one anyway. The first thing I did was try to run GTA 5 on it.

It didn't work. Not "needs tweaking" — the hardware simply wasn't in the conversation. I tried a few more titles at settings that insulted them. Everything stuttered. Eventually I accepted that this machine was not a gaming machine, stopped trying, and moved my gaming to my phone, where things actually ran.

So now I had a laptop that couldn't do the thing I bought it for.

Around then I started paying attention to operating systems, and I noticed something: the people I thought were brilliant were all using Linux.

I was not brilliant. But it occurred to me that if I used Linux, I might *look* brilliant.

That is genuinely why I installed it. Not curiosity, not principle. I wanted the reputation.

## What I actually knew

Almost nothing, and it's worth being specific about how little.

In +1 and +2 my programming language was Visual Basic, so I was on Windows. In college it was C++, Java, Android and PHP — all on Windows, all Windows 7 as far as I remember.

By the time I bought that laptop I had started working, and my job was PHP. The framework was CodeIgniter. The stack came from WAMP and XAMPP: install, click, done. I had never configured Apache. I had never edited `php.ini`. I had never thought about a server as a thing with parts, because Windows had never made me.

The only Linux I had touched was the IT@School Ubuntu in my school lab, which I knew mostly as the environment GIMP ran in. I didn't know that was a customised distribution. I didn't know distributions existed.

What I had was one sentence from school: *Ubuntu is Linux.* That was the whole of my research.

## Three days to make a USB

My plan was sensible. Install Ubuntu alongside Windows 7, keep both, switch when I felt like it. Nothing to lose.

I had never installed an operating system before. I didn't know what a partition was. I understood "bootable USB" as a phrase, not a mechanism.

And I read English slowly. Documentation, forum threads, the answers on Stack Overflow that everyone else seemed to skim — I had to work through them a line at a time, and half the time the line I needed assumed three things I didn't have.

It took me three or four days just to produce a working bootable disk.

Then I plugged it in, restarted, and the laptop booted straight into Windows as if nothing had changed.

I knew what BIOS stood for. Basic Input/Output System — I'd learned that at school, the same way I'd learned that CPU stands for central processing unit. I could have answered it in an exam.

What I had was the expansion of an acronym. What I didn't have was the faintest idea which settings inside it decided where a machine looks for an operating system.

That gap is the story of my whole education, actually. I learned BASIC out of a textbook with no computer to run it on. I learned what BIOS meant without ever having opened one. Theory arrived years before the machine did, every time, and it turns out the theory doesn't help much at the moment you're standing in front of the real thing.

So: more research. There's a key you press at startup. Found the key, got into the firmware — and then discovered that the menus are different for every vendor, and none of the guides I'd read matched what was in front of me. I couldn't find where boot order lived.

So I restarted back into Windows, opened the browser, searched for the boot menu on my specific machine, restarted again, and this time found it.

That loop — boot into Windows to look up how to leave Windows — is the part I remember most clearly. My phone was doing the searching by the end, because the laptop kept being unavailable.

## The four days my laptop was a brick

I got the installer running. I started clicking through it.

And somewhere in the partition step, I deleted my Windows partition.

Not deliberately. I was in a screen full of terms I didn't understand, making choices I couldn't evaluate, and I made the wrong one. Then the Ubuntu installation didn't finish either.

So Windows was gone, Ubuntu was not there, and the laptop I had just saved up for did nothing at all.

I lost my temper completely. The thought I remember having was *"enikk enthinte kedaayirunnu"* — roughly, *what on earth was wrong with me.* Not at the computer. At myself, for touching something I clearly didn't understand.

Then I left it. For four days I didn't open it. I'm not proud of that, but it's what happened.

What got me moving again was borrowing a colleague's PC to write a fresh bootable USB. This time I did not touch manual partitioning. I picked the recommended option and let the installer decide.

It booted. Ubuntu came up.

I genuinely thought I was finished — that now I could sit down, set up my project, and start exploring.

## The Wi-Fi

The Wi-Fi didn't work.

I had no idea why, and no idea what category of problem it even was. I tethered my phone over USB so I'd have internet at all, and started reading.

That took another three or four days, and it is where Linux actually began for me. I learned what a driver is. I learned that the kernel is a thing you can compile. I learned what a module is and how one gets loaded.

I didn't understand most of it properly. But at the end of it the Wi-Fi came up, and I felt something I hadn't felt from a computer before — not relief. Achievement. I had fixed a real thing by understanding it.

That feeling turned out to be the whole hook.

## Installing a stack, the slow way

Next was getting my CodeIgniter project running: PHP, Apache, MySQL.

On Windows this had been one installer. Here it was not one of anything.

I learned `sudo`, and why it exists. I learned users and groups. I learned `apt-get`, what a package manager actually does, and how to add a PPA. I found where Apache keeps its configuration on Ubuntu and that it is not where the tutorials said. I hunted `php.ini` values one at a time. I hit permission errors until I understood the permission model instead of guessing at `chmod` numbers. I learned `systemctl`.

phpMyAdmin took the longest — it asked me a series of configuration questions during install, and I had to go and find out what each one meant before I could answer it.

Every single one of those was slow. And every single one ended with the same feeling the Wi-Fi gave me. Install something, break something, understand why, fix it. I was aware even then that I was spending far too much time setting up an environment I could have had in twenty minutes on Windows.

I didn't care. I'd stopped setting up a machine and started learning how machines work.

## Finding out there were others

Somewhere in there I discovered that Ubuntu was one of many distributions.

I want to be honest about this, because it sounds unlikely: I had no idea. I hadn't researched anything before starting. I had one fact from school — *Ubuntu is Linux* — and I had acted on it directly.

After that I went through them. Debian. Mint. Arch. Linux From Scratch, which teaches you exactly what a distribution is doing for you by making you do it yourself.

For a long stretch I reinstalled roughly once a month. A new distribution every few weeks, on my actual working machine, for no reason other than wanting to see how this one did it. That is an absurd way to treat the computer you earn a living on, and I would not recommend it to anyone. It also taught me more about Linux than any single year since.

The security-focused ones were part of that too — Kali, BlackArch, the pentest distributions. I was curious about the tooling long before I had any professional reason to be. That turned out to matter later, though I had no idea at the time that it would.

I run Gentoo now, as my daily driver, and the reason is the part most people would call the downside: it compiles, it breaks, and when it breaks I have to debug it. That's not a cost I tolerate. It's the thing I like.

Desktop environments went the same way. KDE, then GNOME, then i3, then Sway. Now Hyprland.

And at some point I hit a problem in Waybar, and instead of working around it I read the source and contributed a fix. That was the other threshold — going from someone who configures software to someone who changes it.

## Things I never finished

Once you can change one thing, you start assuming you can build the next thing.

So I've tried. A custom OS. Neovim plugins. A notification daemon. A tiling-manager-shaped thing when Waybar didn't do what I wanted.

Most of them are not finished, and some of them were never realistic. Building your own tiling window manager is not a weekend.

But I've never once regretted starting. Trying to write a notification daemon is how I found out what D-Bus is and how programs on a desktop actually talk to each other — and I would not have learned that from a tutorial, because I'd never have known to look for it.

Unfinished projects have taught me more than finished tutorials.

## Where it ended up

I don't use a GUI for work any more.

Neovim is my editor, and I debug in it. Hyprland and kitty, tiling, everything keyboard-bound. File operations happen in ranger. The only graphical application I genuinely rely on is the browser.

That wasn't a decision either. It happened one replacement at a time, every time I found the keyboard path faster than the mouse path.

Which brings me back to the beginning. I installed Linux to look clever, and the thing I actually got was completely different: the option to look inside.

On Windows I had never wondered how anything worked, because nothing invited the question. The UI was the UI, the stack was the stack, and my job was to build on top of what was given. I wasn't incurious. I just had no surface to be curious *at*.

Linux broke, constantly, in ways that required me to understand it. That's the whole difference.

I can't start work without it now.
