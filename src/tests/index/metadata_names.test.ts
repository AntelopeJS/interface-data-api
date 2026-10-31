import { expect } from "chai";
import { Field, Index, Table } from "@antelopejs/interface-database-decorators";
import { AccessMode, DataAPIMeta } from "../../metadata";

const PROTOTYPE_MEMBER_NAMES = [
  "toString",
  "constructor",
  "hasOwnProperty",
  "valueOf",
];

class Target {}

describe("DataAPIMeta - names shared with Object.prototype members", () => {
  for (const name of PROTOTYPE_MEMBER_NAMES) {
    it(`gives a field named ${name} its own access mode`, () => {
      const meta = new DataAPIMeta(Target);

      meta.setMode(name, AccessMode.ReadWrite);

      expect(Object.hasOwn(meta.fields, name)).to.equal(true);
      expect(meta.readable._default.props.map(([key]) => key)).to.eql([name]);
      expect(meta.writable._default.props.map(([key]) => key)).to.eql([name]);
    });

    it(`keeps the other fields readable when ${name} is not a field`, () => {
      const meta = new DataAPIMeta(Target);

      meta.setMode("title", AccessMode.ReadOnly);

      expect(Object.hasOwn(meta.fields, name)).to.equal(false);
      expect(meta.readable._default.props.map(([key]) => key)).to.eql([
        "title",
      ]);
    });

    it(`lists a field in a list mode named ${name}`, () => {
      const meta = new DataAPIMeta(Target);
      meta.setMode("title", AccessMode.ReadOnly);

      meta.setListable("title", true, name);

      expect(Object.hasOwn(meta.pluck, name)).to.equal(true);
      expect([...meta.pluck[name]]).to.eql(["title"]);
    });

    it(`lists a second field in a list mode named ${name}`, () => {
      const meta = new DataAPIMeta(Target);
      meta.setMode("title", AccessMode.ReadOnly);
      meta.setMode("body", AccessMode.ReadOnly);

      meta.setListable("title", true, name);
      meta.setListable("body", true, name);

      expect([...meta.pluck[name]]).to.eql(["title", "body"]);
    });

    it(`inherits a field named ${name}`, () => {
      const parent = new DataAPIMeta(Target);
      parent.setMode(name, AccessMode.ReadWrite);
      const child = new DataAPIMeta(Target);

      child.inherit(parent);

      expect(Object.hasOwn(child.fields, name)).to.equal(true);
      expect(child.readable._default.props.map(([key]) => key)).to.eql([name]);
    });

    it(`inherits a filter named ${name}`, () => {
      const filter = () => true;
      const parent = new DataAPIMeta(Target);
      parent.setFilter(name, filter);
      const child = new DataAPIMeta(Target);

      child.inherit(parent);

      expect(Object.hasOwn(child.filters, name)).to.equal(true);
      expect(child.filters[name]).to.equal(filter);
    });

    it(`does not take the indexed state of a filter named ${name} from the table prototype`, () => {
      class Rows extends Table {
        @Field("string")
        declare title: string;

        @Index()
        @Field("string")
        declare other: string;
      }
      const meta = new DataAPIMeta(Rows);
      meta.tableClass = Rows;

      meta.setFilter(name, () => true, true);

      expect(meta.fields[name].indexable).to.not.equal(true);
    });
  }
});
