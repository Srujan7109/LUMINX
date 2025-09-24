Virtual Classroom – Current Problem

This project is a prototype for Edunexus, a virtual classroom platform for rural areas.

Current Flow

Login / Signup → User enters their name and role (student or teacher).

Dashboard → User sees the dashboard with a button to join the classroom.

Join Meetroom → User is again prompted to enter their name and role.

Inside Meetroom → Slides, chat, whiteboard, and other classroom features become available.

Problem

There is a redundant step in the current workflow:

Even though the name and role are already stored in localStorage after login, the system again asks the user to re-enter them when joining the meetroom.

This leads to a confusing user experience where the user has to enter the same details twice.

Expected Flow

The desired behavior is:

Login / Signup → User enters their details (name + role) once.

Dashboard → User can directly join the meetroom without entering details again.

Meetroom → User info (name and role) should be auto-fetched from localStorage and used for joining.

Next Steps

Remove the redundant join form.
take a look at login,dashboard,classroom and app.js file to understand the codebase and resolve the issue
Ensure role-based UI rendering still works (teacher vs student).

Keep fallback handling in case localStorage is empty (redirect to login).
