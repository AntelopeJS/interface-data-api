/** Five users for the list, sort and filter journeys. `password` is stored so a leak would show. */
export const USERS = `d.verify__users.insertMany([
  { _id: "u1", email: "alice@example.com", name: "Alice", password: "p1", role: "admin", age: 30, status: "active", createdAt: "2020", biography: "bio1", internalNotes: "n1", nickname: "al", secretNote: "hidden" },
  { _id: "u2", email: "bob@gmail.com", name: "Bob", password: "p2", role: "user", age: 65, status: "inactive", createdAt: "2021", biography: "bio2", internalNotes: "n2" },
  { _id: "u3", email: "carol@gmail.com", name: "Carol", password: "p3", role: "user", age: 18, status: "active", createdAt: "2022", biography: "bio3", internalNotes: "n3" },
  { _id: "u4", email: "dave@example.com", name: "Dave", password: "p4", role: "user", age: 40, status: "active", createdAt: "2023", biography: "bio4", internalNotes: "n4" },
  { _id: "u5", email: "erin@example.com", name: "Erin", password: "p5", role: "user", age: 22, status: "active", createdAt: "2024", biography: "bio5", internalNotes: "n5" },
]);`;

/** Users, order items, an account in the second schema, and two orders: one whose references resolve, one whose references do not. */
export const ORDERS = `d.verify__users.insertMany([
  { _id: "u1", email: "alice@example.com", name: "Alice", password: "p1" },
  { _id: "u2", email: "bob@gmail.com", name: "Bob", password: "p2" },
]);
d.verify__order_items.insertMany([{ _id: "i1", name: "Widget", price: 9.99 }, { _id: "i2", name: "Gadget", price: 24.99 }]);
d.verify_auth__accounts.insertMany([{ _id: "a1", login: "alice-login" }]);
d.verify__orders.insertMany([
  { _id: "o1", userId: "u1", userEmail: "bob@gmail.com", ownerLogin: "a1", tagged: "u2", byEmail: "bob@gmail.com", items: ["i1", "i2"], itemsAll: ["i1"], total: 99 },
  { _id: "o2", userId: "nobody", userEmail: "nobody@x.io", ownerLogin: "zz", tagged: "u1", items: [], itemsAll: [], total: 5 },
]);`;

/** Two authors, three books (one with no author), and one account for the cross-schema join. */
export const BOOKS = `d.verify__authors.insertMany([{ _id: "au1", name: "Zola" }, { _id: "au2", name: "Austen" }]);
d.verify_auth__accounts.insertMany([{ _id: "a1", login: "alice-login" }]);
d.verify__books.insertMany([
  { _id: "b1", authorId: "au1", title: "Nana", accountId: "a1" },
  { _id: "b2", authorId: "au2", title: "Emma", accountId: "zz" },
  { _id: "b3", authorId: "nobody", title: "Orphan" },
]);`;

/** Three groups, four devices: Alpha has three, Beta none, Gamma one. */
export const GROUPS = `d.verify__groups.insertMany([{ _id: "g1", name: "Alpha" }, { _id: "g2", name: "Beta" }, { _id: "g3", name: "Gamma" }]);
d.verify__devices.insertMany([{ _id: "d1", group_id: "g1" }, { _id: "d2", group_id: "g1" }, { _id: "d3", group_id: "g1" }, { _id: "d4", group_id: "g3" }]);`;

/** An invoice and a memo in the table the guarded route reads. */
export const DOCUMENTS = `d.verify__documents.insertMany([{ _id: "x1", title: "Bill", documentType: "invoice" }, { _id: "x2", title: "Memo", documentType: "memo" }]);`;
