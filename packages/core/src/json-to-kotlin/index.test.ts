import { describe, expect, it } from 'vitest';
import { jsonToKotlin, JsonToKotlinError } from './index.ts';
import { className, propertyName, singular } from './naming.ts';

describe('naming', () => {
  it('camelCases keys', () => {
    expect(propertyName('user_id')).toBe('userId');
    expect(propertyName('User-ID')).toBe('userId');
    expect(propertyName('avatarURL')).toBe('avatarUrl');
    expect(propertyName('first name')).toBe('firstName');
  });

  it('escapes hard keywords and leading digits', () => {
    expect(propertyName('class')).toBe('`class`');
    expect(propertyName('in')).toBe('`in`');
    expect(propertyName('2fa')).toBe('n2fa');
  });

  it('PascalCases class names', () => {
    expect(className('order_items')).toBe('OrderItems');
    expect(className('')).toBe('Item');
  });

  it('singularizes common plurals', () => {
    expect(singular('users')).toBe('user');
    expect(singular('categories')).toBe('category');
    expect(singular('boxes')).toBe('box');
    expect(singular('status')).toBe('status');
    expect(singular('data')).toBe('data');
  });
});

describe('jsonToKotlin', () => {
  it('generates kotlinx.serialization classes', () => {
    const { code, classCount } = jsonToKotlin(
      JSON.stringify({ id: 1, user_name: 'a', score: 1.5, active: true, address: { city: 'x' } }),
    );
    expect(classCount).toBe(2);
    expect(code).toBe(`import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Root(
    val id: Int,
    @SerialName("user_name")
    val userName: String,
    val score: Double,
    val active: Boolean,
    val address: Address,
)

@Serializable
data class Address(
    val city: String,
)
`);
  });

  it('uses Long for integers outside Int range', () => {
    expect(jsonToKotlin('{"ts": 1730000000000}').code).toContain('val ts: Long,');
  });

  it('merges array items and marks missing fields nullable', () => {
    const { code } = jsonToKotlin(JSON.stringify({ users: [{ id: 1, email: 'a' }, { id: 2.5 }] }));
    expect(code).toContain('val users: List<User>,');
    expect(code).toContain('val id: Double,');
    expect(code).toContain('val email: String? = null,');
  });

  it('makes null values nullable and types null-only fields dynamically', () => {
    const { code } = jsonToKotlin('{"name": null, "tags": ["a", null]}');
    expect(code).toContain('val name: JsonElement? = null,');
    expect(code).toContain('val tags: List<String?>,');
    expect(code).toContain('import kotlinx.serialization.json.JsonElement');
  });

  it('types empty arrays as lists of dynamic values', () => {
    expect(jsonToKotlin('{"items": []}', { library: 'gson' }).code).toContain('val items: List<Any>,');
  });

  it('warns on mixed types', () => {
    const r = jsonToKotlin('{"v": [1, "a"]}');
    expect(r.code).toContain('val v: List<JsonElement>,');
    expect(r.warnings).toHaveLength(1);
  });

  it('renders root arrays as a typealias', () => {
    const { code } = jsonToKotlin('[{"a": 1}, {"a": 2}]', { rootName: 'Posts' });
    expect(code).toContain('typealias Posts = List<PostsItem>');
    expect(code).toContain('data class PostsItem(');
  });

  it('reuses identical classes and suffixes conflicting ones', () => {
    const same = jsonToKotlin('{"a": {"item": {"x": 1}}, "b": {"item": {"x": 2}}}').code;
    expect(same.match(/data class Item\(/g)).toHaveLength(1);
    const diff = jsonToKotlin('{"a": {"item": {"x": 1}}, "b": {"item": {"y": "s"}}}').code;
    expect(diff).toContain('data class Item(');
    expect(diff).toContain('data class Item2(');
  });

  it('supports Moshi', () => {
    const { code } = jsonToKotlin('{"first_name": "a"}', { library: 'moshi' });
    expect(code).toContain('import com.squareup.moshi.Json\nimport com.squareup.moshi.JsonClass');
    expect(code).toContain('@JsonClass(generateAdapter = true)\ndata class Root(');
    expect(code).toContain('@Json(name = "first_name")');
  });

  it('supports Gson', () => {
    const { code } = jsonToKotlin('{"first_name": "a"}', { library: 'gson' });
    expect(code).toContain('import com.google.gson.annotations.SerializedName');
    expect(code).toContain('@SerializedName("first_name")');
    expect(code).not.toContain('@JsonClass');
  });

  it('emits no annotations for plain classes', () => {
    const { code } = jsonToKotlin('{"first_name": "a"}', { library: 'none' });
    expect(code).toBe('data class Root(\n    val firstName: String,\n)\n');
  });

  it('honours nullability, defaults, mutability, annotateAll and package', () => {
    const { code } = jsonToKotlin('{"id": 1}', {
      nullability: 'all',
      nullDefaults: false,
      mutable: true,
      annotateAll: true,
      packageName: 'com.example.api',
    });
    expect(code.startsWith('package com.example.api\n\n')).toBe(true);
    expect(code).toContain('@SerialName("id")\n    var id: Int?,');
  });

  it('keeps keyword keys working with backticks', () => {
    const { code } = jsonToKotlin('{"class": "a"}');
    expect(code).toContain('val `class`: String,');
    expect(code).not.toContain('@SerialName');
  });

  it('rejects bad input', () => {
    expect(() => jsonToKotlin('{')).toThrow(JsonToKotlinError);
    expect(() => jsonToKotlin('42')).toThrow(/object or array/);
    expect(() => jsonToKotlin('{}', { packageName: 'com..bad' })).toThrow(/package/);
  });
});
