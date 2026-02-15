package com.runlify.schema;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runlify.metadata.ProjectMetadata;
import org.junit.jupiter.api.Test;

import java.io.File;

import static org.junit.jupiter.api.Assertions.*;

class SchemaGeneratorTest {

    private static final ObjectMapper mapper = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final String FIXTURES_BASE = "../tests/fixtures";
    private final SchemaGenerator generator = new SchemaGenerator();

    private ProjectMetadata load(String fixture) throws Exception {
        return mapper.readValue(
            new File(FIXTURES_BASE + "/" + fixture + "/metadata.json"),
            ProjectMetadata.class);
    }

    // -----------------------------------------------------------------------
    // Table naming (pascalSingular)
    // -----------------------------------------------------------------------

    @Test
    void tableName_items() {
        assertEquals("Item", SchemaGenerator.pascalSingular("items"));
    }

    @Test
    void tableName_invoiceTotals() {
        assertEquals("InvoiceTotal", SchemaGenerator.pascalSingular("invoiceTotals"));
    }

    @Test
    void tableName_categories() {
        assertEquals("Category", SchemaGenerator.pascalSingular("categories"));
    }

    @Test
    void tableName_prices() {
        assertEquals("Price", SchemaGenerator.pascalSingular("prices"));
    }

    @Test
    void tableName_articles() {
        assertEquals("Article", SchemaGenerator.pascalSingular("articles"));
    }

    // -----------------------------------------------------------------------
    // DDL generation: with-auto-id (auto-increment int id)
    // -----------------------------------------------------------------------

    @Test
    void withAutoId_generatesSerialPrimaryKey() throws Exception {
        var meta = load("with-auto-id");
        var ddl = generator.generateCreateTable(meta.catalogs().get(0));

        assertTrue(ddl.contains("\"id\" SERIAL PRIMARY KEY"), "Should use SERIAL for autoincrement int id");
        assertTrue(ddl.contains("CREATE TABLE \"Item\""), "Table name should be PascalCase singular");
    }

    @Test
    void withAutoId_hasSearchColumn() throws Exception {
        var meta = load("with-auto-id");
        var ddl = generator.generateCreateTable(meta.catalogs().get(0));

        assertTrue(ddl.contains("\"search\" TEXT"), "Should have hidden search column");
    }

    @Test
    void withAutoId_hasNotNullForRequired() throws Exception {
        var meta = load("with-auto-id");
        var ddl = generator.generateCreateTable(meta.catalogs().get(0));

        assertTrue(ddl.contains("\"name\" TEXT NOT NULL"), "Required string field should be NOT NULL");
    }

    // -----------------------------------------------------------------------
    // DDL generation: with-document-registry (cuid id, float, unique constraints)
    // -----------------------------------------------------------------------

    @Test
    void withDocumentRegistry_documentTable() throws Exception {
        var meta = load("with-document-registry");
        var ddl = generator.generateCreateTable(meta.documents().get(0));

        assertTrue(ddl.contains("CREATE TABLE \"Invoice\""), "Document table name");
        assertTrue(ddl.contains("\"id\" TEXT PRIMARY KEY"), "String id = TEXT PRIMARY KEY");
        assertTrue(ddl.contains("\"amount\" DOUBLE PRECISION"), "Float field");
        assertTrue(ddl.contains("\"date\" TIMESTAMPTZ"), "Datetime field");
    }

    @Test
    void withDocumentRegistry_registryTable() throws Exception {
        var meta = load("with-document-registry");
        var ddl = generator.generateCreateTable(meta.sumRegistries().get(0));

        assertTrue(ddl.contains("CREATE TABLE \"InvoiceTotal\""), "Registry table name");
        // cuid id = TEXT PRIMARY KEY (no SERIAL)
        assertTrue(ddl.contains("\"id\" TEXT PRIMARY KEY"), "Cuid id = TEXT PRIMARY KEY");
        assertTrue(ddl.contains("UNIQUE ("), "Should have unique constraints");
    }

    // -----------------------------------------------------------------------
    // DDL generation: with-info-registry (date type, unique constraints)
    // -----------------------------------------------------------------------

    @Test
    void withInfoRegistry_hasDateColumn() throws Exception {
        var meta = load("with-info-registry");
        var ddl = generator.generateCreateTable(meta.infoRegistries().get(0));

        assertTrue(ddl.contains("CREATE TABLE \"Price\""), "Info registry table name");
        assertTrue(ddl.contains("\"date\" DATE"), "Date field should be DATE type");
    }

    // -----------------------------------------------------------------------
    // DDL generation: with-relations (link fields)
    // -----------------------------------------------------------------------

    @Test
    void withRelations_linkFieldIsText() throws Exception {
        var meta = load("with-relations");
        var articles = meta.catalogs().stream()
            .filter(e -> "articles".equals(e.name()))
            .findFirst().orElseThrow();
        var ddl = generator.generateCreateTable(articles);

        assertTrue(ddl.contains("\"categoryId\" TEXT"), "Link field stored as TEXT column");
    }

    // -----------------------------------------------------------------------
    // Full DDL list (drop + create for each entity)
    // -----------------------------------------------------------------------

    @Test
    void generateDdl_includesDropAndCreate() throws Exception {
        var meta = load("with-document-registry");
        var ddl = generator.generateDdl(meta);

        // 2 entities (invoice + invoiceTotal) × 2 statements (drop + create)
        assertEquals(4, ddl.size());
        assertTrue(ddl.get(0).startsWith("DROP TABLE"));
        assertTrue(ddl.get(1).startsWith("CREATE TABLE"));
    }
}
