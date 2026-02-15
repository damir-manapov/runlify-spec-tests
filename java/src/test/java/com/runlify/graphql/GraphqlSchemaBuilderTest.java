package com.runlify.graphql;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runlify.metadata.ProjectMetadata;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.TypeDefinitionRegistry;
import org.junit.jupiter.api.Test;

import java.io.File;

import static org.junit.jupiter.api.Assertions.*;

class GraphqlSchemaBuilderTest {

    private static final ObjectMapper mapper = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final String FIXTURES_BASE = "../tests/fixtures";
    private final GraphqlSchemaBuilder builder = new GraphqlSchemaBuilder();

    private ProjectMetadata load(String fixture) throws Exception {
        return mapper.readValue(
            new File(FIXTURES_BASE + "/" + fixture + "/metadata.json"),
            ProjectMetadata.class);
    }

    /** Parse SDL to verify it's valid GraphQL. */
    private TypeDefinitionRegistry parse(String sdl) {
        return new SchemaParser().parse(sdl);
    }

    // -----------------------------------------------------------------------
    // Naming
    // -----------------------------------------------------------------------

    @Test
    void singularName() throws Exception {
        var meta = load("with-auto-id");
        assertEquals("Item", GraphqlSchemaBuilder.singularName(meta.catalogs().get(0)));
    }

    @Test
    void pluralName() throws Exception {
        var meta = load("with-auto-id");
        assertEquals("Items", GraphqlSchemaBuilder.pluralName(meta.catalogs().get(0)));
    }

    @Test
    void pluralName_categories() throws Exception {
        var meta = load("with-relations");
        var categories = meta.catalogs().stream()
            .filter(e -> "categories".equals(e.name())).findFirst().orElseThrow();
        assertEquals("Categories", GraphqlSchemaBuilder.pluralName(categories));
    }

    // -----------------------------------------------------------------------
    // with-auto-id: catalog with auto-increment int id
    // -----------------------------------------------------------------------

    @Test
    void withAutoId_validSdl() throws Exception {
        var sdl = builder.buildSdl(load("with-auto-id"));
        var registry = parse(sdl);
        assertNotNull(registry.getType("Item").orElse(null), "Type Item should exist");
        assertNotNull(registry.getType("ListMetadata").orElse(null));
    }

    @Test
    void withAutoId_queries() throws Exception {
        var sdl = builder.buildSdl(load("with-auto-id"));
        // findOne
        assertTrue(sdl.contains("Item(id: Int!): Item"), "findOne query");
        // findAll
        assertTrue(sdl.contains("allItems(page: Int, perPage: Int, sortField: String, sortOrder: String, filter: ItemFilter): [Item]"),
            "findAll query");
        // count
        assertTrue(sdl.contains("_allItemsMeta"), "count query");
    }

    @Test
    void withAutoId_mutations() throws Exception {
        var sdl = builder.buildSdl(load("with-auto-id"));
        // create: auto-generated int id should NOT be in create args
        assertTrue(sdl.contains("createItem("), "create mutation exists");
        assertFalse(sdl.contains("createItem(id:"), "auto-generated id not in create args");
        // update: id required
        assertTrue(sdl.contains("updateItem(id: Int!"), "update with required id");
        // remove
        assertTrue(sdl.contains("removeItem(id: Int!): Item"), "remove mutation");
    }

    @Test
    void withAutoId_filterInput() throws Exception {
        var sdl = builder.buildSdl(load("with-auto-id"));
        assertTrue(sdl.contains("input ItemFilter"), "filter input type");
        assertTrue(sdl.contains("ids: [Int]"), "ids filter with Int type");
    }

    // -----------------------------------------------------------------------
    // with-document-registry: document + sum registry
    // -----------------------------------------------------------------------

    @Test
    void withDocumentRegistry_validSdl() throws Exception {
        var sdl = builder.buildSdl(load("with-document-registry"));
        var registry = parse(sdl);
        assertNotNull(registry.getType("Invoice").orElse(null));
        assertNotNull(registry.getType("InvoiceTotal").orElse(null));
    }

    @Test
    void withDocumentRegistry_bothEntities() throws Exception {
        var sdl = builder.buildSdl(load("with-document-registry"));
        assertTrue(sdl.contains("createInvoice("), "Invoice create mutation");
        assertTrue(sdl.contains("createInvoiceTotal("), "InvoiceTotal create mutation");
        assertTrue(sdl.contains("allInvoices("), "allInvoices query");
        assertTrue(sdl.contains("allInvoiceTotals("), "allInvoiceTotals query");
    }

    // -----------------------------------------------------------------------
    // with-info-registry: periodic registry with slice queries
    // -----------------------------------------------------------------------

    @Test
    void withInfoRegistry_sliceQueries() throws Exception {
        var sdl = builder.buildSdl(load("with-info-registry"));
        assertTrue(sdl.contains("sliceOfTheLastPrice("), "sliceOfTheLast query");
        assertTrue(sdl.contains("sliceOfTheFirstPrice("), "sliceOfTheFirst query");
    }

    @Test
    void withInfoRegistry_validSdl() throws Exception {
        var sdl = builder.buildSdl(load("with-info-registry"));
        var registry = parse(sdl);
        assertNotNull(registry.getType("Price").orElse(null));
    }

    // -----------------------------------------------------------------------
    // with-relations: link fields with in/not_in filters
    // -----------------------------------------------------------------------

    @Test
    void withRelations_linkFilters() throws Exception {
        var sdl = builder.buildSdl(load("with-relations"));
        assertTrue(sdl.contains("categoryId: String"), "equal filter on link");
        assertTrue(sdl.contains("categoryId_in: [String]"), "in filter on link");
        assertTrue(sdl.contains("categoryId_not_in: [String]"), "not_in filter on link");
    }

    @Test
    void withRelations_definedFilter() throws Exception {
        var sdl = builder.buildSdl(load("with-relations"));
        assertTrue(sdl.contains("categoryId_defined: Boolean"), "_defined for optional link");
    }

    @Test
    void withRelations_stringIdInCreateArgs() throws Exception {
        var sdl = builder.buildSdl(load("with-relations"));
        // Manual string id should be required in create
        assertTrue(sdl.contains("createArticle(id: String!"), "manual string id required in create");
    }
}
